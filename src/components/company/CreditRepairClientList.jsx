// src/components/company/CreditRepairClientList.jsx
//
// Superseded by ServiceClientList.jsx (genericized to a `serviceId` prop so
// Credit Repair/Case Management, Fraud Alert Removal, and Personal
// Identifiers can all share one implementation instead of three
// near-identical copies). Kept as a thin re-export, not deleted outright,
// in case anything outside this session's changes still imports the old
// name directly.
import ServiceClientList from './ServiceClientList';

export default function CreditRepairClientList(props) {
  return <ServiceClientList {...props} serviceId="credit_repair" />;
}
