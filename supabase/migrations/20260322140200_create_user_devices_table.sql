-- Phase 16: Create user_devices table for push notification token storage

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT,                         -- unique device identifier
  app_version TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, push_token)
);

-- Indexes
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_active ON user_devices(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_devices"
  ON user_devices FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_devices"
  ON user_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_devices"
  ON user_devices FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_delete_own_devices"
  ON user_devices FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_user_devices_updated_at
  BEFORE UPDATE ON user_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
