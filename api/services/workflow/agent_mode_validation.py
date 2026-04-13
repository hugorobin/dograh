"""Constraints between workflow_configurations.agent_mode and workflow_json shape."""

from __future__ import annotations

from fastapi import HTTPException

AGENT_MODES = frozenset({"single_prompt", "multi_prompt", "graph"})


def normalize_agent_mode(value: str | None) -> str:
    if value in AGENT_MODES:
        return value
    return "graph"


def validate_agent_mode_constraints(
    workflow_definition: dict, agent_mode: str | None
) -> None:
    """Raise HTTPException 422 if the graph does not match the authoring mode."""
    mode = normalize_agent_mode(agent_mode)
    nodes = workflow_definition.get("nodes") or []
    agent_nodes = [n for n in nodes if n.get("type") == "agentNode"]

    if mode == "single_prompt":
        if len(agent_nodes) != 1:
            raise HTTPException(
                status_code=422,
                detail=(
                    "single_prompt workflows must have exactly one agent node "
                    f"(found {len(agent_nodes)})."
                ),
            )
