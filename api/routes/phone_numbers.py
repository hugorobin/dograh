"""Phone number management — per-DID inbound workflow and optional pre-connect webhook."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import db_client
from api.db.models import UserModel
from api.services.auth.depends import get_user
from api.utils.common import get_backend_endpoints

router = APIRouter(prefix="/phone-numbers", tags=["phone-numbers"])


class PhoneNumberCreate(BaseModel):
    e164: str
    name: Optional[str] = None
    workflow_id: Optional[int] = None
    inbound_webhook_url: Optional[str] = None
    termination_uri: Optional[str] = None
    sip_username: Optional[str] = None
    sip_password: Optional[str] = None
    outbound_transport: Optional[str] = "TCP"


class PhoneNumberUpdate(BaseModel):
    name: Optional[str] = None
    workflow_id: Optional[int] = None
    inbound_webhook_url: Optional[str] = None
    clear_workflow: bool = False
    clear_webhook: bool = False
    termination_uri: Optional[str] = None
    sip_username: Optional[str] = None
    sip_password: Optional[str] = None
    outbound_transport: Optional[str] = None
    clear_termination_uri: bool = False
    clear_sip_credentials: bool = False


class PhoneNumberResponse(BaseModel):
    id: int
    e164: str
    name: Optional[str]
    workflow_id: Optional[int]
    workflow_name: Optional[str]
    inbound_webhook_url: Optional[str]
    inbound_url: Optional[str]
    termination_uri: Optional[str]
    sip_username: Optional[str]
    outbound_transport: Optional[str]

    model_config = {"from_attributes": True}


def _to_response(phone, backend_endpoint: str = "") -> PhoneNumberResponse:
    wf_id = phone.workflow_id
    inbound_url = (
        f"{backend_endpoint}/api/v1/telephony/inbound/{wf_id}" if wf_id else None
    )
    workflow_name = None
    if phone.workflow is not None:
        workflow_name = phone.workflow.name
    return PhoneNumberResponse(
        id=phone.id,
        e164=phone.e164,
        name=phone.name,
        workflow_id=wf_id,
        workflow_name=workflow_name,
        inbound_webhook_url=phone.inbound_webhook_url,
        inbound_url=inbound_url,
        termination_uri=phone.termination_uri,
        sip_username=phone.sip_username,
        outbound_transport=phone.outbound_transport or "TCP",
    )


@router.get("", response_model=list[PhoneNumberResponse])
async def list_phone_numbers(user: UserModel = Depends(get_user)):
    """List all phone numbers for the current organization."""
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    backend_endpoint, _ = await get_backend_endpoints()
    phones = await db_client.list_phone_numbers(user.selected_organization_id)
    return [_to_response(p, backend_endpoint) for p in phones]


@router.post("", response_model=PhoneNumberResponse, status_code=201)
async def create_phone_number(
    body: PhoneNumberCreate, user: UserModel = Depends(get_user)
):
    """Register a phone number for the current organization."""
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    e164 = body.e164.strip()
    if not e164:
        raise HTTPException(status_code=422, detail="e164 must not be empty")

    if body.workflow_id is not None:
        wf = await db_client.get_workflow(
            body.workflow_id, organization_id=user.selected_organization_id
        )
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")

    try:
        phone = await db_client.create_phone_number(
            organization_id=user.selected_organization_id,
            e164=e164,
            name=body.name,
            workflow_id=body.workflow_id,
            inbound_webhook_url=body.inbound_webhook_url or None,
            termination_uri=body.termination_uri or None,
            sip_username=body.sip_username or None,
            sip_password=body.sip_password or None,
            outbound_transport=body.outbound_transport or "TCP",
        )
    except Exception as e:
        if "unique" in str(e).lower() or "_org_e164_uc" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Phone number {e164!r} already registered for this organization",
            )
        raise

    backend_endpoint, _ = await get_backend_endpoints()
    phone = await db_client.get_phone_number(phone.id, user.selected_organization_id)
    return _to_response(phone, backend_endpoint)


@router.patch("/{phone_number_id}", response_model=PhoneNumberResponse)
async def update_phone_number(
    phone_number_id: int,
    body: PhoneNumberUpdate,
    user: UserModel = Depends(get_user),
):
    """Update a phone number's name, workflow, or inbound webhook URL."""
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    if body.workflow_id is not None and not body.clear_workflow:
        wf = await db_client.get_workflow(
            body.workflow_id, organization_id=user.selected_organization_id
        )
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow not found")

    phone = await db_client.update_phone_number(
        phone_number_id=phone_number_id,
        organization_id=user.selected_organization_id,
        name=body.name,
        workflow_id=body.workflow_id,
        inbound_webhook_url=body.inbound_webhook_url or None,
        clear_workflow=body.clear_workflow,
        clear_webhook=body.clear_webhook,
        termination_uri=body.termination_uri or None,
        sip_username=body.sip_username or None,
        sip_password=body.sip_password or None,
        outbound_transport=body.outbound_transport or None,
        clear_termination_uri=body.clear_termination_uri,
        clear_sip_credentials=body.clear_sip_credentials,
    )
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    backend_endpoint, _ = await get_backend_endpoints()
    phone = await db_client.get_phone_number(phone.id, user.selected_organization_id)
    return _to_response(phone, backend_endpoint)


@router.delete("/{phone_number_id}", status_code=204)
async def delete_phone_number(
    phone_number_id: int, user: UserModel = Depends(get_user)
):
    """Remove a phone number from the organization."""
    if not user.selected_organization_id:
        raise HTTPException(status_code=400, detail="No organization selected")

    deleted = await db_client.delete_phone_number(
        phone_number_id, user.selected_organization_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Phone number not found")
