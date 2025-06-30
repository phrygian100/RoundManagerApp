-- Create members table for invitation and team management
-- This table will be used by edge functions for member invitations

CREATE TABLE IF NOT EXISTS public.members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uid UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  perms JSONB DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_members_uid ON public.members(uid);
CREATE INDEX IF NOT EXISTS idx_members_account_id ON public.members(account_id);
CREATE INDEX IF NOT EXISTS idx_members_email ON public.members(email);
CREATE INDEX IF NOT EXISTS idx_members_invite_code ON public.members(invite_code);
CREATE INDEX IF NOT EXISTS idx_members_status ON public.members(status);

-- Enable Row Level Security
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the members table
-- Users can see members of their own account
CREATE POLICY "Users can view members of their account" ON public.members
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM public.members WHERE uid = auth.uid()
    )
  );

-- Only owners can insert/update/delete members
CREATE POLICY "Owners can manage members" ON public.members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.members 
      WHERE uid = auth.uid() 
      AND account_id = members.account_id 
      AND role = 'owner'
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access" ON public.members
  FOR ALL USING (auth.role() = 'service_role');

-- Update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON public.members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 