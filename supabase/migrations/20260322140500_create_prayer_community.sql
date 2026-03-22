-- Phase 19: Prayer Community
-- Group-scoped prayer request walls with prayed/encouraged interactions

CREATE TABLE IF NOT EXISTS prayer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  is_answered BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prayer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('prayed', 'encouraged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, user_id, type)  -- one pray/encourage per user per request
);

-- Indexes
CREATE INDEX idx_prayer_requests_group ON prayer_requests(group_id, created_at DESC);
CREATE INDEX idx_prayer_requests_user ON prayer_requests(user_id);
CREATE INDEX idx_prayer_interactions_request ON prayer_interactions(request_id);
CREATE INDEX idx_prayer_interactions_user ON prayer_interactions(user_id);

-- RLS
ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_interactions ENABLE ROW LEVEL SECURITY;

-- Prayer requests: group members can view
CREATE POLICY "prayer_select_member"
  ON prayer_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = prayer_requests.group_id
      AND user_id = (select auth.uid())
    )
  );

-- Group members can create prayer requests
CREATE POLICY "prayer_insert_member"
  ON prayer_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = prayer_requests.group_id
      AND user_id = (select auth.uid())
    )
  );

-- Only request creator can update (edit content, mark answered)
CREATE POLICY "prayer_update_creator"
  ON prayer_requests FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

-- Creator or group leader can delete
CREATE POLICY "prayer_delete_creator_or_leader"
  ON prayer_requests FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = prayer_requests.group_id
      AND leader_id = (select auth.uid())
    )
  );

-- Prayer interactions: group members can view
CREATE POLICY "interaction_select_member"
  ON prayer_interactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prayer_requests pr
      JOIN public.group_members gm ON gm.group_id = pr.group_id
      WHERE pr.id = prayer_interactions.request_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- Group members can add interactions
CREATE POLICY "interaction_insert_member"
  ON prayer_interactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM prayer_requests pr
      JOIN public.group_members gm ON gm.group_id = pr.group_id
      WHERE pr.id = prayer_interactions.request_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- Only the interacting user can remove their interaction (un-pray)
CREATE POLICY "interaction_delete_own"
  ON prayer_interactions FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Trigger for updated_at on prayer_requests
CREATE TRIGGER update_prayer_requests_updated_at
  BEFORE UPDATE ON prayer_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
