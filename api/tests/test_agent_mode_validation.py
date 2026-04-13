import pytest
from fastapi import HTTPException

from api.services.workflow.agent_mode_validation import validate_agent_mode_constraints


def test_single_prompt_accepts_one_agent():
    validate_agent_mode_constraints(
        {"nodes": [{"type": "agentNode"}]},
        "single_prompt",
    )


def test_single_prompt_rejects_multiple_agents():
    with pytest.raises(HTTPException) as exc_info:
        validate_agent_mode_constraints(
            {"nodes": [{"type": "agentNode"}, {"type": "agentNode"}]},
            "single_prompt",
        )
    assert exc_info.value.status_code == 422
    assert "exactly one" in str(exc_info.value.detail).lower()


def test_graph_mode_ignores_agent_count():
    validate_agent_mode_constraints(
        {"nodes": [{"type": "agentNode"}, {"type": "agentNode"}]},
        "graph",
    )
