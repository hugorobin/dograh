"""add phone_numbers table

Revision ID: b1c2d3e4f5a6
Revises: e7254d2c6c18
Create Date: 2026-04-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "e7254d2c6c18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "phone_numbers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("e164", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("workflow_id", sa.Integer(), nullable=True),
        sa.Column("inbound_webhook_url", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workflow_id"],
            ["workflows.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "e164", name="_org_e164_uc"),
    )
    op.create_index(
        "ix_phone_numbers_organization_id", "phone_numbers", ["organization_id"]
    )
    op.create_index("ix_phone_numbers_e164", "phone_numbers", ["e164"])
    op.create_index("ix_phone_numbers_id", "phone_numbers", ["id"])


def downgrade() -> None:
    op.drop_index("ix_phone_numbers_e164", table_name="phone_numbers")
    op.drop_index("ix_phone_numbers_organization_id", table_name="phone_numbers")
    op.drop_index("ix_phone_numbers_id", table_name="phone_numbers")
    op.drop_table("phone_numbers")
