from __future__ import annotations

"""Helpers for merging incoming user-configuration updates with what is already
stored, while honouring masked API keys.
"""

from typing import Any, Dict

from api.schemas.user_configuration import UserConfiguration
from api.services.configuration.masking import resolve_masked_api_keys

SERVICE_FIELDS = ("llm", "tts", "stt", "embeddings", "realtime")


def merge_user_configurations(
    existing: UserConfiguration, incoming_partial: Dict[str, Any]
) -> UserConfiguration:
    """Merge *incoming_partial* onto *existing* and return a new UserConfiguration.

    *incoming_partial* is the body of the PUT request (already `model_dump()`ed or
    extracted via Pydantic `model_dump`).

    Rules:
    1. If a service block is absent in the request, keep the existing one.
    2. If provider unchanged and the api_key field is either missing or equal to
       the masked placeholder, preserve the existing real key.
    3. If provider changes, the incoming api_key is used verbatim (validation
       will fail later if it is missing).
    4. Non-service top-level fields (e.g. `test_phone_number`) are overwritten
       when supplied.
    """

    merged = existing.model_dump(exclude_none=True)

    def _merge_service_block(service_name: str):
        incoming_cfg = incoming_partial.get(service_name)
        if incoming_cfg is None:
            return  # nothing to do

        old_cfg = merged.get(service_name, {})

        provider_changed = (
            old_cfg.get("provider") is not None
            and incoming_cfg.get("provider") is not None
            and incoming_cfg.get("provider") != old_cfg.get("provider")
        )

        incoming_api_key = incoming_cfg.get("api_key")

        if not provider_changed:
            # conditional preservation of api_key
            if incoming_api_key is not None:
                if old_cfg and "api_key" in old_cfg:
                    incoming_cfg["api_key"] = resolve_masked_api_keys(
                        incoming_api_key, old_cfg["api_key"]
                    )
            else:
                if "api_key" in old_cfg:
                    incoming_cfg["api_key"] = old_cfg["api_key"]

        merged[service_name] = incoming_cfg

    for service in SERVICE_FIELDS:
        _merge_service_block(service)

    # other simple fields
    if "is_realtime" in incoming_partial:
        merged["is_realtime"] = incoming_partial["is_realtime"]

    if "test_phone_number" in incoming_partial:
        merged["test_phone_number"] = incoming_partial["test_phone_number"]

    if "timezone" in incoming_partial:
        merged["timezone"] = incoming_partial["timezone"]

    if "provider_api_keys" in incoming_partial:
        incoming_vault = incoming_partial["provider_api_keys"]
        if isinstance(incoming_vault, dict):
            old_vault: dict[str, Any] = dict(merged.get("provider_api_keys") or {})
            new_vault = dict(old_vault)
            for prov, inc_val in incoming_vault.items():
                if inc_val is None:
                    new_vault.pop(prov, None)
                    continue
                old_val = old_vault.get(prov)
                if old_val is not None:
                    new_vault[prov] = resolve_masked_api_keys(inc_val, old_val)
                else:
                    new_vault[prov] = inc_val
            merged["provider_api_keys"] = new_vault

    return UserConfiguration.model_validate(merged)
