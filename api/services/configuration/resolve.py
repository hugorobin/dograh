"""Resolve effective config by merging per-workflow model overrides onto global config."""

from __future__ import annotations

from api.schemas.user_configuration import UserConfiguration
from api.services.configuration.registry import (
    REGISTRY,
    ServiceType,
)

# Maps override key → (UserConfiguration field, ServiceType for registry lookup)
_SECTION_MAP: dict[str, ServiceType] = {
    "llm": ServiceType.LLM,
    "tts": ServiceType.TTS,
    "stt": ServiceType.STT,
    "realtime": ServiceType.REALTIME,
}


def _build_section_from_override(service_type: ServiceType, override: dict):
    """Construct a typed config object from a raw override dict using the registry."""
    provider = override.get("provider")
    if not provider:
        return None
    registry = REGISTRY.get(service_type, {})
    config_cls = registry.get(provider)
    if config_cls is None:
        return None
    return config_cls(**override)


def _override_needs_vault_api_key(override: dict) -> bool:
    if "api_key" not in override:
        return True
    k = override.get("api_key")
    if k is None:
        return True
    if k == "":
        return True
    if isinstance(k, list) and not any(str(x).strip() for x in k):
        return True
    return False


def _enrich_override_with_vault(
    override: dict, vault: dict[str, str | list[str]]
) -> dict:
    if not vault or not _override_needs_vault_api_key(override):
        return override
    prov = override.get("provider")
    if not prov:
        return override
    entry = vault.get(prov)
    if entry is None:
        return override
    if isinstance(entry, list) and not any(str(x).strip() for x in entry):
        return override
    if isinstance(entry, str) and not entry.strip():
        return override
    out = dict(override)
    out["api_key"] = entry
    return out


def _section_has_usable_api_key(section) -> bool:
    keys = section.get_all_api_keys()
    return any(str(k).strip() for k in keys)


def _hydrate_api_keys_from_vault(effective: UserConfiguration) -> UserConfiguration:
    vault = effective.provider_api_keys or {}
    if not vault:
        return effective
    for field in ("llm", "tts", "stt", "embeddings", "realtime"):
        section = getattr(effective, field, None)
        if section is None:
            continue
        if _section_has_usable_api_key(section):
            continue
        prov = section.provider
        entry = vault.get(prov)
        if entry is None:
            continue
        if isinstance(entry, list) and not any(str(x).strip() for x in entry):
            continue
        if isinstance(entry, str) and not entry.strip():
            continue
        setattr(effective, field, section.model_copy(update={"api_key": entry}))
    return effective


def resolve_effective_config(
    user_config: UserConfiguration,
    model_overrides: dict | None,
) -> UserConfiguration:
    """Deep-merge workflow model_overrides onto global user config.

    - If model_overrides is None or empty, returns a copy of user_config unchanged.
    - For each section (llm, tts, stt, realtime), if the override contains that key:
      - If the global section is None, construct a new config from the override.
      - If the provider changes, construct a new config from the override.
      - Otherwise, merge override fields onto the existing config (model_copy).
    - is_realtime is a simple boolean override.
    - Sections not in the override are inherited from global unchanged.
    - The original user_config is never mutated.
    - After merging, missing service api_keys are filled from provider_api_keys
      when present (vault hydration).
    """
    vault = user_config.provider_api_keys or {}

    if not model_overrides:
        effective = user_config.model_copy(deep=True)
        return _hydrate_api_keys_from_vault(effective)

    effective = user_config.model_copy(deep=True)

    # Handle is_realtime boolean
    if "is_realtime" in model_overrides:
        effective.is_realtime = model_overrides["is_realtime"]

    # Handle service sections
    for section_key, service_type in _SECTION_MAP.items():
        if section_key not in model_overrides:
            continue

        override = model_overrides[section_key]
        base = getattr(effective, section_key)

        if base is None:
            enriched = _enrich_override_with_vault(dict(override), vault)
            setattr(
                effective,
                section_key,
                _build_section_from_override(service_type, enriched),
            )
        elif "provider" in override and override["provider"] != base.provider:
            enriched = _enrich_override_with_vault(dict(override), vault)
            setattr(
                effective,
                section_key,
                _build_section_from_override(service_type, enriched),
            )
        else:
            merged = base.model_copy(update=override)
            setattr(effective, section_key, merged)

    return _hydrate_api_keys_from_vault(effective)
