"""
Signed outbound lifecycle webhooks (call_started / call_ended) to workflow.outbound_webhook_url.

Mirrors Retell-style agent webhooks: POST JSON with X-Dograh-Signature (HMAC-SHA256 of body).
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC
from typing import Any

import httpx
from loguru import logger

from api.constants import DOGRAH_WEBHOOK_SECRET
from api.db import db_client

LIFECYCLE_WEBHOOK_TIMEOUT_SEC = 10.0
SIGNATURE_HEADER = "X-Dograh-Signature"


def _sign_body(body_bytes: bytes) -> str:
    secret = DOGRAH_WEBHOOK_SECRET.encode("utf-8")
    digest = hmac.new(secret, body_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _serialize_workflow_run_snapshot(
    workflow_run, *, include_gathered: bool
) -> dict[str, Any]:
    created = workflow_run.created_at
    snap: dict[str, Any] = {
        "id": workflow_run.id,
        "workflow_id": workflow_run.workflow_id,
        "call_type": workflow_run.call_type,
        "mode": workflow_run.mode,
        "is_completed": workflow_run.is_completed,
        "state": workflow_run.state,
        "initial_context": workflow_run.initial_context or {},
    }
    if created is not None:
        if created.tzinfo is None:
            snap["created_at"] = created.replace(tzinfo=UTC).isoformat()
        else:
            snap["created_at"] = created.isoformat()
    if include_gathered:
        snap["gathered_context"] = workflow_run.gathered_context or {}
        snap["usage_info"] = workflow_run.usage_info or {}
        snap["annotations"] = workflow_run.annotations or {}
    return snap


async def send_lifecycle_webhook(workflow_run_id: int, event: str) -> None:
    """
    POST a lifecycle event to workflow_configurations.outbound_webhook_url if configured.

    Skips when DOGRAH_WEBHOOK_SECRET is unset or URL is empty.
    """
    if not DOGRAH_WEBHOOK_SECRET:
        logger.debug(
            "Skipping lifecycle webhook (DOGRAH_WEBHOOK_SECRET not set) "
            f"for run {workflow_run_id} event={event}"
        )
        return

    workflow_run = await db_client.get_workflow_run_by_id(workflow_run_id)
    if not workflow_run or not workflow_run.workflow:
        logger.warning(
            f"lifecycle webhook: workflow run {workflow_run_id} or workflow missing"
        )
        return

    configs = workflow_run.workflow.workflow_configurations or {}
    if not isinstance(configs, dict):
        return
    url = (configs.get("outbound_webhook_url") or "").strip()
    if not url:
        return

    include_gathered = event == "call_ended"
    payload: dict[str, Any] = {
        "event": event,
        "workflow_run": _serialize_workflow_run_snapshot(
            workflow_run, include_gathered=include_gathered
        ),
    }
    body_bytes = json.dumps(
        payload,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    signature = _sign_body(body_bytes)
    headers = {
        "Content-Type": "application/json",
        SIGNATURE_HEADER: signature,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                content=body_bytes,
                headers=headers,
                timeout=LIFECYCLE_WEBHOOK_TIMEOUT_SEC,
            )
        if response.status_code < 200 or response.status_code >= 300:
            logger.warning(
                f"lifecycle webhook {event} for run {workflow_run_id} failed: "
                f"{response.status_code} {response.text[:300]}"
            )
        else:
            logger.info(
                f"lifecycle webhook {event} delivered for run {workflow_run_id} "
                f"status={response.status_code}"
            )
    except httpx.RequestError as e:
        logger.warning(
            f"lifecycle webhook {event} request error for run {workflow_run_id}: {e}"
        )
    except Exception as e:
        logger.error(
            f"lifecycle webhook {event} unexpected error for run {workflow_run_id}: {e}",
            exc_info=True,
        )


async def send_lifecycle_webhook_job(ctx, workflow_run_id: int, event: str) -> None:
    """ARQ worker entrypoint for lifecycle webhooks."""
    await send_lifecycle_webhook(workflow_run_id, event)
