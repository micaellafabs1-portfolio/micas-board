-- ============================================================
-- Mica's Board — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Lists (columns)
create table lists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  emoji text default '📌',
  type text default 'normal',          -- 'normal' or 'templates'
  position integer not null default 0,
  created_at timestamptz default now()
);

-- Cards
create table cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists(id) on delete cascade,
  title text not null,
  label text default 'None',           -- Urgent / High / Medium / Supplier / Response / Done / None
  due_date date,                       -- real date type, so it can power the Zapier/Make deadline automation
  description text default '',
  position integer not null default 0, -- exact order within the list (drag-and-drop reorder)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Members (visual only, since there's no login)
create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,
  color text not null,
  role text default 'Member',
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security: since this board has NO login (anyone with
-- the link can edit, by your choice), we open read/write to
-- anyone using the public "anon" key. This is intentional given
-- "no login" was the chosen tradeoff — do not use this schema for
-- anything containing sensitive data without adding auth.
-- ============================================================

alter table lists enable row level security;
alter table cards enable row level security;
alter table members enable row level security;

create policy "public read lists" on lists for select using (true);
create policy "public write lists" on lists for insert with check (true);
create policy "public update lists" on lists for update using (true);
create policy "public delete lists" on lists for delete using (true);

create policy "public read cards" on cards for select using (true);
create policy "public write cards" on cards for insert with check (true);
create policy "public update cards" on cards for update using (true);
create policy "public delete cards" on cards for delete using (true);

create policy "public read members" on members for select using (true);
create policy "public write members" on members for insert with check (true);
create policy "public update members" on members for update using (true);
create policy "public delete members" on members for delete using (true);

-- ============================================================
-- Seed data — matches your real board
-- ============================================================

-- Lists
insert into lists (id, title, emoji, type, position) values
  ('00000000-0000-0000-0000-000000000001', E'Today''s Priorities', '🎯', 'normal', 0),
  ('00000000-0000-0000-0000-000000000002', 'New Orders', '📥', 'normal', 1),
  ('00000000-0000-0000-0000-000000000003', 'Creating Presentation', '📊', 'normal', 2),
  ('00000000-0000-0000-0000-000000000004', 'Presentation Sent', '📤', 'normal', 3),
  ('00000000-0000-0000-0000-000000000005', 'Waiting On Others', '⏳', 'normal', 4),
  ('00000000-0000-0000-0000-000000000006', 'Purchase Orders', '📃', 'normal', 5),
  ('00000000-0000-0000-0000-000000000007', 'Freight Arranged', '🚚', 'normal', 6),
  ('00000000-0000-0000-0000-000000000008', 'In Transit', '✈️', 'normal', 7),
  ('00000000-0000-0000-0000-000000000009', 'Completed', '✅', 'normal', 8),
  ('00000000-0000-0000-0000-00000000000a', 'Templates', '📋', 'templates', 9);

-- Cards
insert into cards (list_id, title, label, due_date, description, position) values
  ('00000000-0000-0000-0000-000000000001', 'Tumblers for Annue', 'Urgent', '2026-06-17', '', 0),
  ('00000000-0000-0000-0000-000000000001', 'RetailX - Waiting on Rilee re Warehouse', 'Urgent', null, '', 1),
  ('00000000-0000-0000-0000-000000000001', 'Our Cafe - 100 Shirts', 'Urgent', null, '', 2),

  ('00000000-0000-0000-0000-000000000002', 'Okada - Duffle Bags - 100pcs', 'None', '2026-06-23', '', 0),
  ('00000000-0000-0000-0000-000000000002', 'Try Lang', 'Urgent', null, '', 1),
  ('00000000-0000-0000-0000-000000000002', 'Our Cafe - Shirts', 'None', '2026-06-23', '', 2),

  ('00000000-0000-0000-0000-000000000003', 'RetailX - Update Monday Board', 'Response', null, '', 0),

  ('00000000-0000-0000-0000-000000000004', 'Boom Chicken', 'Response', '2026-06-23', '', 0),

  ('00000000-0000-0000-0000-000000000005', 'NovaTech - Q3 Pricing Deck Client Feedback', 'Medium', null, '', 0),
  ('00000000-0000-0000-0000-000000000005', 'Acme Corp - Warehouse Slot Confirmation', 'Urgent', null, '', 1),

  ('00000000-0000-0000-0000-000000000006', 'BlueSky Ltd - PO for Office Chairs', 'High', null, '', 0),
  ('00000000-0000-0000-0000-000000000006', 'Acme Corp - Create PO for Raw Materials', 'None', null, '', 1),

  ('00000000-0000-0000-0000-000000000007', 'GlobalFreight - Container Booking July', 'None', null, '', 0),

  ('00000000-0000-0000-0000-000000000008', 'GlobalFreight - Shipment POD Upload', 'Supplier', null, '', 0),

  ('00000000-0000-0000-0000-000000000009', 'NovaTech - Q3 Pricing Deck', 'Medium', '2026-06-26', '', 0),

  ('00000000-0000-0000-0000-00000000000a', 'BOARD LEGEND', 'None', null,
    E'LABEL KEY\n\nUrgent — needs action today\nHigh — action needed within 48h\nMedium — in progress, normal pace\nSupplier — awaiting supplier response\nResponse — awaiting client response\n\nLIST KEY\n\nToday''s Priorities — pull cards here when they need attention now', 0),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - New Order', 'None', null,
    E'CLIENT - PRODUCT - QTY\n\nExample:\nOkada - Tumblers - 500pcs\n\nCLIENT:\nCONTACT:\nPRIORITY:\nDUE DATE:\nORDER #:\nPO #:\nSUPPLIER:\nNOTES:', 1),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - Purchase Order', 'None', null,
    E'CLIENT - PRODUCT - PO\n\nExample:\nOkada - Tumblers - PO\n\nCLIENT:\nSUPPLIER:\nPRODUCT:\nQUANTITY:\nPO NUMBER:\nCOST:\nPAYMENT STATUS:\nNOTES:', 2),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - Presentation', 'None', null,
    E'CLIENT - PRESENTATION TYPE\n\nExample:\nNovaTech - Q3 Pricing Deck\n\nCLIENT:\nPRESENTATION TYPE:\nDUE DATE:\nSENT DATE:\nSTATUS:\nNOTES:', 3),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - Freight Arranged', 'None', null,
    E'CLIENT - SHIPMENT TASK\n\nExample:\nGlobalFreight - Container Booking\n\nCLIENT:\nCARRIER:\nPICKUP DATE:\nBOOKING REFERENCE:\nDESTINATION:\nCOST:\nNOTES:', 4),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - In Transit', 'None', null,
    E'CLIENT - SHIPMENT TASK\n\nExample:\nGlobalFreight - Shipment POD Upload\n\nCLIENT:\nTRACKING NUMBER:\nETA:\nPOD STATUS:\nNOTES:', 5),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - Waiting On Others', 'None', null,
    E'CLIENT - WHAT YOU''RE WAITING ON\n\nExample:\nRetailX - Warehouse Slot Confirmation\n\nCLIENT:\nWAITING ON:\nFOLLOW-UP SENT:\nREMINDER DATE:\nNOTES:', 6),
  ('00000000-0000-0000-0000-00000000000a', 'TEMPLATE - Completed', 'None', null,
    E'CLIENT - TASK\n\nExample:\nOur Cafe - 100 Shirts\n\nCLIENT:\nTASK:\nINVOICE SENT:\nMONDAY BOARD UPDATED:\nNOTES:', 7);

-- Members
insert into members (name, initials, color, role) values
  ('Micaella Fabian', 'MF', '#0747A6', 'Admin');
