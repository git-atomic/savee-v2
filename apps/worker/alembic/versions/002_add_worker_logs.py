"""add_worker_logs

Revision ID: 002_add_worker_logs
Revises: d471ecb2ad8e
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_add_worker_logs'
down_revision: Union[str, None] = 'add_blocks_type'  # Chain: d471ecb2ad8e -> add_blocks_type -> 002_add_worker_logs
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add job_logs table for serverless log storage (if not exists)."""
    # Check if table already exists using raw SQL
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'job_logs'
        )
    """))
    table_exists = result.scalar()
    
    if not table_exists:
        op.create_table('job_logs',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('run_id', sa.Integer(), nullable=False),
            sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('type', sa.String(length=50), nullable=False),
            sa.Column('url', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=50), nullable=True),
            sa.Column('timing', sa.String(length=50), nullable=True),
            sa.Column('message', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['run_id'], ['runs.id'], name=op.f('fk_job_logs_run_id_runs'), ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_job_logs'))
        )
        op.create_index(op.f('ix_job_logs_run_id'), 'job_logs', ['run_id'], unique=False)
        op.create_index(op.f('ix_job_logs_timestamp'), 'job_logs', ['timestamp'], unique=False)
        op.create_index(op.f('ix_job_logs_run_id_timestamp'), 'job_logs', ['run_id', 'timestamp'], unique=False)
    # If table exists, skip creation (it was created manually or by another migration)


def downgrade() -> None:
    """Remove job_logs table."""
    op.drop_index(op.f('ix_job_logs_run_id_timestamp'), table_name='job_logs')
    op.drop_index(op.f('ix_job_logs_timestamp'), table_name='job_logs')
    op.drop_index(op.f('ix_job_logs_run_id'), table_name='job_logs')
    op.drop_table('job_logs')
