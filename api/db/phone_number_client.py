"""Database client for managing phone number configurations."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from api.db.base_client import BaseDBClient
from api.db.models import PhoneNumberModel


class PhoneNumberClient(BaseDBClient):
    async def list_phone_numbers(self, organization_id: int) -> list[PhoneNumberModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(PhoneNumberModel)
                .options(joinedload(PhoneNumberModel.workflow))
                .where(PhoneNumberModel.organization_id == organization_id)
                .order_by(PhoneNumberModel.created_at.asc())
            )
            return list(result.scalars().all())

    async def get_phone_number(
        self, phone_number_id: int, organization_id: int
    ) -> Optional[PhoneNumberModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(PhoneNumberModel)
                .options(joinedload(PhoneNumberModel.workflow))
                .where(
                    PhoneNumberModel.id == phone_number_id,
                    PhoneNumberModel.organization_id == organization_id,
                )
            )
            return result.scalars().first()

    async def get_phone_number_by_e164(
        self, e164: str, organization_id: int
    ) -> Optional[PhoneNumberModel]:
        """Used by inbound telephony resolution to look up DID → workflow."""
        async with self.async_session() as session:
            result = await session.execute(
                select(PhoneNumberModel)
                .options(joinedload(PhoneNumberModel.workflow))
                .where(
                    PhoneNumberModel.e164 == e164,
                    PhoneNumberModel.organization_id == organization_id,
                )
            )
            return result.scalars().first()

    async def create_phone_number(
        self,
        organization_id: int,
        e164: str,
        name: Optional[str] = None,
        workflow_id: Optional[int] = None,
        inbound_webhook_url: Optional[str] = None,
        termination_uri: Optional[str] = None,
        sip_username: Optional[str] = None,
        sip_password: Optional[str] = None,
        outbound_transport: Optional[str] = "TCP",
    ) -> PhoneNumberModel:
        async with self.async_session() as session:
            phone = PhoneNumberModel(
                organization_id=organization_id,
                e164=e164,
                name=name,
                workflow_id=workflow_id,
                inbound_webhook_url=inbound_webhook_url,
                termination_uri=termination_uri,
                sip_username=sip_username,
                sip_password=sip_password,
                outbound_transport=outbound_transport or "TCP",
            )
            session.add(phone)
            try:
                await session.commit()
            except Exception as e:
                await session.rollback()
                raise e
            await session.refresh(phone)
            return phone

    async def update_phone_number(
        self,
        phone_number_id: int,
        organization_id: int,
        name: Optional[str] = None,
        workflow_id: Optional[int] = None,
        inbound_webhook_url: Optional[str] = None,
        clear_workflow: bool = False,
        clear_webhook: bool = False,
        termination_uri: Optional[str] = None,
        sip_username: Optional[str] = None,
        sip_password: Optional[str] = None,
        outbound_transport: Optional[str] = None,
        clear_termination_uri: bool = False,
        clear_sip_credentials: bool = False,
    ) -> Optional[PhoneNumberModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(PhoneNumberModel).where(
                    PhoneNumberModel.id == phone_number_id,
                    PhoneNumberModel.organization_id == organization_id,
                )
            )
            phone = result.scalars().first()
            if not phone:
                return None
            if name is not None:
                phone.name = name
            if clear_workflow:
                phone.workflow_id = None
            elif workflow_id is not None:
                phone.workflow_id = workflow_id
            if clear_webhook:
                phone.inbound_webhook_url = None
            elif inbound_webhook_url is not None:
                phone.inbound_webhook_url = inbound_webhook_url
            if clear_termination_uri:
                phone.termination_uri = None
            elif termination_uri is not None:
                phone.termination_uri = termination_uri
            if clear_sip_credentials:
                phone.sip_username = None
                phone.sip_password = None
            else:
                if sip_username is not None:
                    phone.sip_username = sip_username
                if sip_password is not None:
                    phone.sip_password = sip_password
            if outbound_transport is not None:
                phone.outbound_transport = outbound_transport
            try:
                await session.commit()
            except Exception as e:
                await session.rollback()
                raise e
            await session.refresh(phone)
            return phone

    async def delete_phone_number(
        self, phone_number_id: int, organization_id: int
    ) -> bool:
        async with self.async_session() as session:
            result = await session.execute(
                select(PhoneNumberModel).where(
                    PhoneNumberModel.id == phone_number_id,
                    PhoneNumberModel.organization_id == organization_id,
                )
            )
            phone = result.scalars().first()
            if not phone:
                return False
            await session.delete(phone)
            try:
                await session.commit()
            except Exception as e:
                await session.rollback()
                raise e
            return True
