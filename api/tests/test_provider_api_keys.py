"""Tests for provider_api_keys vault: merge, masking, and resolve hydration."""

from api.schemas.user_configuration import UserConfiguration
from api.services.configuration.masking import (
    mask_key,
    mask_user_config,
    resolve_masked_api_keys,
)
from api.services.configuration.merge import merge_user_configurations
from api.services.configuration.registry import OpenAILLMService, SpeachesLLMConfiguration
from api.services.configuration.resolve import resolve_effective_config

REAL = "sk-real-openai-1234567890abcdef"
MASKED = mask_key(REAL)


class TestMergeProviderApiKeys:
    def test_preserves_existing_when_incoming_empty_dict(self):
        existing = UserConfiguration(
            provider_api_keys={"openai": REAL},
            llm=OpenAILLMService(provider="openai", api_key=REAL, model="gpt-4.1"),
        )
        merged = merge_user_configurations(existing, {"provider_api_keys": {}})
        assert merged.provider_api_keys.get("openai") == REAL

    def test_resolves_masked_placeholder(self):
        existing = UserConfiguration(
            provider_api_keys={"openai": REAL},
        )
        merged = merge_user_configurations(
            existing,
            {"provider_api_keys": {"openai": MASKED}},
        )
        assert merged.provider_api_keys["openai"] == REAL

    def test_removes_key_when_incoming_none(self):
        existing = UserConfiguration(
            provider_api_keys={"openai": REAL, "deepgram": "dg-old"},
        )
        merged = merge_user_configurations(
            existing,
            {"provider_api_keys": {"openai": None}},
        )
        assert "openai" not in merged.provider_api_keys
        assert merged.provider_api_keys.get("deepgram") == "dg-old"


class TestMaskUserConfigVault:
    def test_masks_provider_api_keys(self):
        cfg = UserConfiguration(
            provider_api_keys={"openai": REAL},
            llm=OpenAILLMService(provider="openai", api_key=REAL, model="gpt-4.1"),
        )
        masked = mask_user_config(cfg)
        assert masked["provider_api_keys"]["openai"] == MASKED


class TestResolveVaultHydration:
    def test_hydrates_llm_from_vault_when_service_key_missing(self):
        user_config = UserConfiguration(
            provider_api_keys={"speaches": REAL},
            llm=SpeachesLLMConfiguration(
                provider="speaches",
                model="llama3",
                base_url="http://localhost:11434/v1",
                api_key=None,
            ),
        )
        result = resolve_effective_config(user_config, None)
        assert result.llm.api_key == REAL

    def test_override_without_api_key_uses_vault(self):
        user_config = UserConfiguration(
            provider_api_keys={"openai": REAL},
            llm=OpenAILLMService(provider="openai", api_key=REAL, model="gpt-4.1"),
        )
        result = resolve_effective_config(
            user_config,
            {"llm": {"model": "gpt-4.1-mini"}},
        )
        assert result.llm.model == "gpt-4.1-mini"
        assert result.llm.api_key == REAL

    def test_new_section_from_override_gets_vault_key(self):
        user_config = UserConfiguration(
            provider_api_keys={"openai": REAL},
            llm=None,
        )
        result = resolve_effective_config(
            user_config,
            {"llm": {"provider": "openai", "model": "gpt-4.1-mini"}},
        )
        assert result.llm is not None
        assert result.llm.provider == "openai"
        assert result.llm.api_key == REAL


def test_resolve_masked_api_keys_list_to_list():
    existing_list = [REAL, "other-key"]
    incoming = [MASKED, "new-key"]
    out = resolve_masked_api_keys(incoming, existing_list)
    assert out[0] == REAL
    assert out[1] == "new-key"
