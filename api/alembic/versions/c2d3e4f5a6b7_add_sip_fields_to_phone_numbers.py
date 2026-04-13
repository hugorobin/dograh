"""add SIP trunking fields to phone_numbers

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-10 00:01:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "phone_numbers", sa.Column("termination_uri", sa.String(), nullable=True)
    )
    op.add_column(
        "phone_numbers", sa.Column("sip_username", sa.String(), nullable=True)
    )
    op.add_column(
        "phone_numbers", sa.Column("sip_password", sa.String(), nullable=True)
    )
    op.add_column(
        "phone_numbers",
        sa.Column("outbound_transport", sa.String(), nullable=True, server_default="TCP"),
    )


def downgrade() -> None:
    op.drop_column("phone_numbers", "outbound_transport")
    op.drop_column("phone_numbers", "sip_password")
    op.drop_column("phone_numbers", "sip_username")
    op.drop_column("phone_numbers", "termination_uri")
