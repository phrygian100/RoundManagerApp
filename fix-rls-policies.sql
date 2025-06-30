-- Fix RLS policies for members table to eliminate infinite recursion
-- Run this in Supabase Dashboard > SQL Editor

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view members of their account" ON public.members;
DROP POLICY IF EXISTS "Owners can manage members" ON public.members;
DROP POLICY IF EXISTS "Authenticated users can manage members" ON public.members;

-- Create simplified policies that don't cause circular references
CREATE POLICY "Users can view their own member records" ON public.members
  FOR SELECT USING (
    uid = auth.uid() OR 
    account_id = auth.uid()
  );

-- Allow authenticated users to manage members (we rely on application logic for fine-grained control)
CREATE POLICY "Authenticated users can manage members" ON public.members
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Ensure service role always has full access (for edge functions)
CREATE POLICY "Service role full access" ON public.members
  FOR ALL USING (auth.role() = 'service_role'); 