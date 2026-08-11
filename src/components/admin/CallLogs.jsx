import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Tabs, Tab, Table, Spinner } from "react-bootstrap";

export default function CallLogs() {
  const [logs, setLogs] = useState({ exp: [], tu: [], eq: [], resend: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select(
          `
          *,
          profiles(full_name),
          clients(full_name)
        `
        )
        .order("call_date", { ascending: false });

      if (error) {
        console.error("Error fetching logs:", error);
        return;
      }

      const grouped = { exp: [], tu: [], eq: [], resend: [] };

      for (const log of data) {
        if (log.exp_start_time) grouped.exp.push(log);
        if (log.tu_start_time) grouped.tu.push(log);
        if (log.eq_start_time) grouped.eq.push(log);

        const hasUndisputedResult =
          (log.exp_result && !["DISPUTED", "DELETED"].includes(log.exp_result.toUpperCase())) ||
          (log.tu_result && !["DISPUTED", "DELETED"].includes(log.tu_result.toUpperCase())) ||
          (log.eq_result && !["DISPUTED", "DELETED"].includes(log.eq_result.toUpperCase()));

        if (hasUndisputedResult) grouped.resend.push(log);
      }

      setLogs(grouped);
      setLoading(false);
    };

    fetchLogs();
  }, []);

const formatDate = (isoDate) => {
  if (!isoDate) return "—";
  const localDate = new Date(isoDate);
  return localDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};


  const renderTable = (rows, bureauPrefix) => {
    const filteredRows = rows.filter((row) => {
      const clientName = row.clients?.full_name?.toLowerCase() || "";
      const employeeName = row.profiles?.full_name?.toLowerCase() || "";
      const phone = row.phone_number?.toLowerCase() || "";
      return (
        clientName.includes(searchTerm) ||
        employeeName.includes(searchTerm) ||
        phone.includes(searchTerm)
      );
    });

    return (
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Phone #</th>
            <th>Rep Name</th>
            <th>Supervisor</th>
            <th>Result</th>
            <th>Callback</th>
            <th>Reason</th>
            <th>Employee</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr key={row.id} className={row.backlog ? "table-red" : ""}>
              <td>{row.call_date}</td>
              <td>
                {row.clients?.full_name ? (
                  <a href={`/clients/${row.client_id}`} className="text-decoration-none">
                    {row.clients.full_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>{row.phone_number || "—"}</td>
              <td>
                {row[`${bureauPrefix}_rep_name`] || "—"}
                {row[`${bureauPrefix}_auth_required`] && (
                  <i className="bi bi-shield-lock-fill text-warning ms-2" title="Auth Required"></i>
                )}
              </td>
              <td>{row[`${bureauPrefix}_supervisor_name`] || "—"}</td>
              <td>{row[`${bureauPrefix}_result`] || "—"}</td>
              <td>{formatDate(row[`${bureauPrefix}_callback_date`]) || "—"}</td>
              <td>{row.reason|| "—"}</td>
              <td>
                {row.profiles?.full_name ? (
                  <a href={`/admin/${row.employee_id}`} className="text-decoration-none">
                    {row.profiles.full_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

const renderTableMixed = (rows) => {
  const detectBureau = (log) => {
    if (log.exp_start_time) return "exp";
    if (log.tu_start_time) return "tu";
    if (log.eq_start_time) return "eq";
    return "";
  };

  const filteredRows = rows.filter((row) => {
    const clientName = row.clients?.full_name?.toLowerCase() || "";
    const employeeName = row.profiles?.full_name?.toLowerCase() || "";
    const phone = row.phone_number?.toLowerCase() || "";
    return (
      clientName.includes(searchTerm) ||
      employeeName.includes(searchTerm) ||
      phone.includes(searchTerm)
    );
  });

  return (
    <Table striped bordered hover responsive>
      <thead>
        <tr>
          <th>Date</th>
          <th>Bureau</th>
          <th>Client</th>
          <th>Rep Name</th>
          <th>Supervisor</th>
          <th>Result</th>
          <th>Reason</th>
          <th>Employee</th>
        </tr>
      </thead>
      <tbody>
        {filteredRows.map((row) => {
          const bureau = detectBureau(row);

          return (
            <tr key={row.id} className={row.backlog ? "table-red" : ""}>
              <td>{formatDate(row.call_date)}</td>
              <td className="text-uppercase">{bureau}</td>
              <td>
                {row.clients?.full_name ? (
                  <a href={`/clients/${row.client_id}`} className="text-decoration-none">
                    {row.clients.full_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {row[`${bureau}_rep_name`] || "—"}
                {row[`${bureau}_auth_required`] && (
                  <i className="bi bi-shield-lock-fill text-warning ms-2" title="Auth Required"></i>
                )}
              </td>
              <td>{row[`${bureau}_supervisor_name`] || "—"}</td>
              <td>{row[`${bureau}_result`] || "—"}</td>
              <td>{row.reason || "—"}</td>
              <td>
                {row.profiles?.full_name ? (
                  <a href={`/admin/${row.employee_id}`} className="text-decoration-none">
                    {row.profiles.full_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

  return (
    <div className="container mt-4 login-container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-4">📞 Call Logs</h2>
        <input
          type="text"
          className="form-control w-25"
          placeholder="Search by client, employee or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
        />
      </div>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <Tabs defaultActiveKey="exp" className="mb-3">
          <Tab eventKey="exp" title="Experian">
            {renderTable(logs.exp, "exp")}
          </Tab>
          <Tab eventKey="tu" title="TransUnion">
            {renderTable(logs.tu, "tu")}
          </Tab>
          <Tab eventKey="eq" title="Equifax">
            {renderTable(logs.eq, "eq")}
          </Tab>
          <Tab eventKey="resend" title="Resend Documents">
            {renderTableMixed(logs.resend)}
          </Tab>
        </Tabs>
      )}
    </div>
  );
}
