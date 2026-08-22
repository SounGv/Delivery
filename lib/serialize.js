// Field-name mapping between the D1 (SQLite) schema (snake_case) and the
// exact PascalCase field names app.js/app.pages.js already expect (these
// came straight from the old Google Sheets headers). Keeping this
// translation in one place means the DB can use idiomatic snake_case
// naming while the frontend needs zero changes.

const MAPS = {
  customers: [
    ['customer_id','CustomerID'],['customer_name','CustomerName'],['branch_name','BranchName'],
    ['address','Address'],['latitude','Latitude'],['longitude','Longitude'],['phone','Phone'],
    ['contact_person','ContactPerson'],['note','Note'],['status','Status'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  // PINHash intentionally has no entry anywhere — it lives in employee_credentials
  // and must never be selected alongside employees rows.
  employees: [
    ['employee_id','EmployeeID'],['employee_name','EmployeeName'],['phone','Phone'],
    ['role','Role'],['vehicle_id','VehicleID'],['status','Status'],['username','Username'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  vehicles: [
    ['vehicle_id','VehicleID'],['vehicle_name','VehicleName'],['license_plate','LicensePlate'],
    ['vehicle_type','VehicleType'],['capacity_box','CapacityBox'],['fuel_cost_per_km','FuelCostPerKm'],
    ['current_driver','CurrentDriver'],['vehicle_status','VehicleStatus'],
    ['cartrack_vehicle_id','CartrackVehicleID'],['cartrack_registration','CartrackRegistration'],
    ['current_latitude','CurrentLatitude'],['current_longitude','CurrentLongitude'],
    ['current_speed','CurrentSpeed'],['current_heading','CurrentHeading'],['current_odometer','CurrentOdometer'],
    ['last_position_time','LastPositionTime'],['last_sync_at','LastSyncAt'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  external_providers: [
    ['provider_id','ProviderID'],['provider_name','ProviderName'],['contact_person','ContactPerson'],
    ['phone','Phone'],['vehicle_type','VehicleType'],['default_rate','DefaultRate'],['rate_type','RateType'],
    ['note','Note'],['status','Status'],['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  external_vehicles: [
    ['external_vehicle_id','ExternalVehicleID'],['provider_id','ProviderID'],['provider_name','ProviderName'],
    ['driver_name','DriverName'],['driver_phone','DriverPhone'],['vehicle_type','VehicleType'],
    ['license_plate','LicensePlate'],['capacity_box','CapacityBox'],['rate','Rate'],['rate_type','RateType'],
    ['status','Status'],['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  deliveries: [
    ['delivery_id','DeliveryID'],['delivery_date','DeliveryDate'],
    ['document_date','DocumentDate'],['due_date','DueDate'],
    ['customer_name','CustomerName'],
    ['branch_name','BranchName'],['invoice_no','InvoiceNo'],['po_no','PoNo'],['address','Address'],
    ['latitude','Latitude'],['longitude','Longitude'],['amount','Amount'],['box_qty','BoxQty'],['priority','Priority'],
    ['note','Note'],['route_id','RouteID'],['status','Status'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['created_by','CreatedBy'],['updated_by','UpdatedBy'],
    ['version','Version'],['is_deleted','IsDeleted'],
  ],
  routes: [
    ['route_id','RouteID'],['delivery_date','DeliveryDate'],['route_type','RouteType'],
    ['driver_name','DriverName'],['driver_phone','DriverPhone'],['driver_employee_id','DriverEmployeeID'],
    ['vehicle_type','VehicleType'],['vehicle_name','VehicleName'],['license_plate','LicensePlate'],
    ['provider_name','ProviderName'],['total_stops','TotalStops'],['total_boxes','TotalBoxes'],
    ['total_distance','TotalDistance'],['estimated_duration','EstimatedDuration'],
    ['estimated_fuel_cost','EstimatedFuelCost'],['estimated_toll_cost','EstimatedTollCost'],
    ['estimated_parking_cost','EstimatedParkingCost'],['estimated_external_cost','EstimatedExternalCost'],
    ['estimated_other_cost','EstimatedOtherCost'],['estimated_total_cost','EstimatedTotalCost'],
    ['actual_fuel_cost','ActualFuelCost'],['actual_toll_cost','ActualTollCost'],
    ['actual_parking_cost','ActualParkingCost'],['actual_external_cost','ActualExternalCost'],
    ['actual_other_cost','ActualOtherCost'],['actual_total_cost','ActualTotalCost'],
    ['cost_per_stop','CostPerStop'],['cost_per_box','CostPerBox'],['status','Status'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['created_by','CreatedBy'],['updated_by','UpdatedBy'],
    ['is_deleted','IsDeleted'],
  ],
  route_stops: [
    ['route_id','RouteID'],['stop_order','StopOrder'],['delivery_id','DeliveryID'],
    ['customer_name','CustomerName'],['branch_name','BranchName'],['address','Address'],
    ['latitude','Latitude'],['longitude','Longitude'],['box_qty','BoxQty'],
    ['distance_from_previous','DistanceFromPrevious'],['estimated_arrival','EstimatedArrival'],
    ['actual_arrival','ActualArrival'],['check_in_latitude','CheckInLatitude'],
    ['check_in_longitude','CheckInLongitude'],['check_in_accuracy','CheckInAccuracy'],
    ['check_in_time','CheckInTime'],['delivery_completed_time','DeliveryCompletedTime'],
    ['status','Status'],['photo_url','PhotoURL'],
  ],
  expenses: [
    ['expense_id','ExpenseID'],['route_id','RouteID'],['delivery_id','DeliveryID'],
    ['expense_date','ExpenseDate'],['expense_type','ExpenseType'],['amount','Amount'],
    ['description','Description'],['receipt_image_url','ReceiptImageURL'],
    ['created_at','CreatedAt'],['created_by','CreatedBy'],['is_deleted','IsDeleted'],
  ],
  expense_claims: [
    ['claim_id','ClaimID'],['route_id','RouteID'],['driver_name','DriverName'],
    ['advance_amount','AdvanceAmount'],['actual_expense','ActualExpense'],['refund_amount','RefundAmount'],
    ['additional_amount','AdditionalAmount'],['balance','Balance'],['status','Status'],
    ['created_at','CreatedAt'],['updated_at','UpdatedAt'],['is_deleted','IsDeleted'],
  ],
  settings: [
    ['key','Key'],['value','Value'],['group_name','Group'],['label','Label'],['updated_at','UpdatedAt'],
  ],
  activity_logs: [
    ['log_id','LogID'],['action','Action'],['reference_id','ReferenceID'],
    ['description','Description'],['user_name','User'],['timestamp','Timestamp'],
  ],
  gps_logs: [
    ['log_id','LogID'],['route_id','RouteID'],['delivery_id','DeliveryID'],['latitude','Latitude'],
    ['longitude','Longitude'],['accuracy','Accuracy'],['timestamp','Timestamp'],['event_type','EventType'],
  ],
  cartrack_vehicles: [
    ['cartrack_vehicle_id','CartrackVehicleID'],['registration','Registration'],['latitude','Latitude'],
    ['longitude','Longitude'],['speed','Speed'],['heading','Heading'],['odometer','Odometer'],
    ['current_driver','CurrentDriver'],['vehicle_status','VehicleStatus'],
    ['last_position_time','LastPositionTime'],['fetched_at','FetchedAt'],
  ],
  cartrack_logs: [
    ['log_id','LogID'],['sync_at','SyncAt'],['fetched','Fetched'],['matched','Matched'],
    ['status','Status'],['message','Message'],
  ],
};

function toFrontend(table, row) {
  if (!row) return row;
  const map = MAPS[table];
  if (!map) return row;
  const out = {};
  for (const [snake, pascal] of map) out[pascal] = row[snake] !== undefined ? row[snake] : null;
  return out;
}

function toFrontendList(table, rows) {
  return (rows || []).map((r) => toFrontend(table, r));
}

// Reverse mapping: frontend PascalCase payload -> DB snake_case columns.
// Only known columns pass through — this is the whitelist that keeps
// writes from ever smuggling an unexpected column (e.g. a client trying
// to set PINHash by name, which doesn't exist on `employees` at all, so
// it's silently dropped rather than erroring).
function toDb(table, obj) {
  const map = MAPS[table];
  if (!map || !obj) return {};
  const out = {};
  for (const [snake, pascal] of map) {
    if (obj[pascal] !== undefined) out[snake] = obj[pascal];
  }
  return out;
}

module.exports = { toFrontend, toFrontendList, toDb, MAPS };
