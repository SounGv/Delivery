-- ============================================================
-- Dispatch Center — Cloudflare D1 (SQLite) schema
-- Replaces Google Sheets. Only reachable from Pages Functions /
-- the cron Worker via the `DB` binding — there is no public API
-- surface on D1 itself, so there is no RLS-equivalent to configure.
-- SQLite has no native boolean/timestamptz: booleans are 0/1
-- integers, all dates/timestamps are ISO-8601 text.
-- ============================================================

-- ------------------------------------------------------------
-- ID generation — replaces Sheets' O(n)-scan nextId().
-- next_value is incremented inside the same batch() as the
-- insert that consumes it, so the two statements commit or fail
-- together (D1's batch() is one atomic transaction).
-- ------------------------------------------------------------
create table id_counters (
  prefix     text primary key,
  next_value integer not null default 1
);

-- ------------------------------------------------------------
-- Core tables (mirror the 15 Google Sheets tabs)
-- ------------------------------------------------------------
create table customers (
  customer_id     text primary key,
  customer_name   text not null,
  branch_name     text,
  address         text,
  latitude        real,
  longitude       real,
  phone           text,
  contact_person  text,
  note            text,
  status          text not null default 'Active',
  created_at      text not null,
  updated_at      text not null,
  is_deleted      integer not null default 0
);
create index idx_customers_active on customers (is_deleted);

create table employees (
  employee_id    text primary key,
  employee_name  text not null,
  phone          text,
  role           text,
  vehicle_id     text,
  status         text not null default 'Active',
  username       text unique,
  created_at     text not null,
  updated_at     text not null,
  is_deleted     integer not null default 0
);
create index idx_employees_active on employees (is_deleted);

-- PIN hash lives in its own table, never joined into a generic
-- "select * from employees" path — structural fix for the
-- PINHash-leak class of bug found earlier this session.
create table employee_credentials (
  employee_id  text primary key references employees(employee_id) on delete cascade,
  pin_hash     text not null,
  updated_at   text not null
);

create table vehicles (
  vehicle_id            text primary key,
  vehicle_name          text,
  license_plate         text,
  vehicle_type          text,
  capacity_box          integer,
  fuel_cost_per_km      real,
  current_driver        text,
  vehicle_status        text not null default 'Available',
  cartrack_vehicle_id   text,
  cartrack_registration text,
  current_latitude      real,
  current_longitude     real,
  current_speed         real,
  current_heading       real,
  current_odometer      real,
  last_position_time    text,
  last_sync_at          text,
  created_at            text not null,
  updated_at            text not null,
  is_deleted            integer not null default 0
);
create index idx_vehicles_active on vehicles (is_deleted);

create table external_providers (
  provider_id     text primary key,
  provider_name   text not null,
  contact_person  text,
  phone           text,
  vehicle_type    text,
  default_rate    real,
  rate_type       text,
  note            text,
  status          text not null default 'Active',
  created_at      text not null,
  updated_at      text not null,
  is_deleted      integer not null default 0
);

create table external_vehicles (
  external_vehicle_id text primary key,
  provider_id          text references external_providers(provider_id),
  provider_name        text,
  driver_name          text,
  driver_phone         text,
  vehicle_type         text,
  license_plate        text,
  capacity_box         integer,
  rate                 real,
  rate_type            text,
  status               text not null default 'Available',
  created_at           text not null,
  updated_at           text not null,
  is_deleted           integer not null default 0
);
create index idx_extveh_active on external_vehicles (is_deleted);

create table deliveries (
  delivery_id   text primary key,
  delivery_date text not null,
  customer_name text,
  branch_name   text,
  invoice_no    text,
  address       text,
  latitude      real,
  longitude     real,
  box_qty       integer,
  priority      text default 'NORMAL',
  note          text,
  route_id      text,
  status        text not null default 'Draft',
  created_at    text not null,
  updated_at    text not null,
  created_by    text,
  updated_by    text,
  version       integer not null default 1,
  is_deleted    integer not null default 0
);
create index idx_deliveries_date on deliveries (delivery_date, is_deleted);
create index idx_deliveries_route on deliveries (route_id, is_deleted);
create index idx_deliveries_status on deliveries (status, is_deleted);

create table routes (
  route_id                text primary key,
  delivery_date           text not null,
  route_type              text,
  driver_name             text,
  driver_phone            text,
  driver_employee_id      text references employees(employee_id),
  vehicle_type            text,
  vehicle_name            text,
  license_plate           text,
  provider_name           text,
  total_stops             integer,
  total_boxes             integer,
  total_distance          real,
  estimated_duration      integer,
  estimated_fuel_cost     real,
  estimated_toll_cost     real,
  estimated_parking_cost  real,
  estimated_external_cost real,
  estimated_other_cost    real,
  estimated_total_cost    real,
  actual_fuel_cost        real,
  actual_toll_cost        real,
  actual_parking_cost     real,
  actual_external_cost    real,
  actual_other_cost       real,
  actual_total_cost       real,
  cost_per_stop           real,
  cost_per_box            real,
  status                  text not null default 'Planned',
  created_at              text not null,
  updated_at              text not null,
  created_by              text,
  updated_by              text,
  is_deleted              integer not null default 0
);
create index idx_routes_date on routes (delivery_date, is_deleted);
create index idx_routes_driver on routes (driver_employee_id, is_deleted);

create table route_stops (
  route_id                 text not null references routes(route_id) on delete cascade,
  stop_order               integer not null,
  delivery_id              text references deliveries(delivery_id),
  customer_name            text,
  branch_name              text,
  address                  text,
  latitude                 real,
  longitude                real,
  box_qty                  integer,
  distance_from_previous   real,
  estimated_arrival        text,
  actual_arrival           text,
  check_in_latitude        real,
  check_in_longitude       real,
  check_in_accuracy        real,
  check_in_time            text,
  delivery_completed_time  text,
  status                   text not null default 'Pending',
  photo_url                text,
  primary key (route_id, stop_order)
);
create index idx_routestops_delivery on route_stops (delivery_id);

create table expenses (
  expense_id        text primary key,
  route_id          text references routes(route_id),
  delivery_id       text references deliveries(delivery_id),
  expense_date      text not null,
  expense_type      text,
  amount            real,
  description       text,
  receipt_image_url text,
  created_at        text not null,
  created_by        text,
  is_deleted        integer not null default 0
);
create index idx_expenses_date on expenses (expense_date, is_deleted);
create index idx_expenses_route on expenses (route_id, is_deleted);

create table expense_claims (
  claim_id           text primary key,
  route_id           text references routes(route_id),
  driver_name        text,
  advance_amount     real,
  actual_expense     real,
  refund_amount      real,
  additional_amount  real,
  balance            real,
  status             text not null default 'Pending',
  created_at         text not null,
  updated_at         text not null,
  is_deleted         integer not null default 0
);

create table settings (
  key        text primary key,
  value      text,
  group_name text,
  label      text,
  updated_at text not null
);

create table activity_logs (
  log_id       integer primary key autoincrement,
  action       text not null,
  reference_id text,
  description  text,
  user_name    text,
  timestamp    text not null
);
create index idx_activitylogs_time on activity_logs (timestamp desc);

create table gps_logs (
  log_id      integer primary key autoincrement,
  route_id    text references routes(route_id),
  delivery_id text references deliveries(delivery_id),
  latitude    real,
  longitude   real,
  accuracy    real,
  timestamp   text not null,
  event_type  text
);
create index idx_gpslogs_route on gps_logs (route_id, timestamp);

create table cartrack_vehicles (
  cartrack_vehicle_id text,
  registration        text,
  latitude             real,
  longitude            real,
  speed                real,
  heading              real,
  odometer             real,
  current_driver       text,
  vehicle_status       text,
  last_position_time   text,
  fetched_at           text not null
);

create table cartrack_logs (
  log_id   integer primary key autoincrement,
  sync_at  text not null,
  fetched  integer,
  matched  integer,
  status   text,
  message  text
);

-- ------------------------------------------------------------
-- Driver auth (replaces CacheService-backed sessions). Token is
-- generated app-side with crypto.randomUUID() before insert —
-- SQLite has no built-in UUID function.
-- ------------------------------------------------------------
create table driver_sessions (
  token       text primary key,
  employee_id text not null references employees(employee_id) on delete cascade,
  created_at  text not null,
  expires_at  text not null
);
create index idx_driversessions_expires on driver_sessions (expires_at);

-- ------------------------------------------------------------
-- Idempotency (replaces the 'req:'+requestId CacheService entries).
-- response is a JSON string (SQLite has no jsonb type).
-- ------------------------------------------------------------
create table request_log (
  request_id text primary key,
  action     text,
  response   text not null,
  created_at text not null
);
create index idx_requestlog_created on request_log (created_at);

-- ------------------------------------------------------------
-- Temporary diagnostic table for functions/webhook/[[path]].js —
-- captures raw TRCloud webhook deliveries so their payload shape can be
-- inspected (no published docs exist). Safe to drop once the real
-- TRCloud integration is built and this is no longer needed.
-- ------------------------------------------------------------
create table webhook_debug_log (
  id          integer primary key autoincrement,
  source      text,
  method      text,
  url         text,
  headers     text,
  body        text,
  received_at text not null
);
