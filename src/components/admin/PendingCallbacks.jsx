import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Tabs, Tab, Table, Spinner, Form, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function PendingCallbacks() {
  const [clients, setClients] = useState({ exp: [], tu: [], eq: [] });
  const [loading, setLoading] = useState(true);
  const [marked, setMarked] = useState({});
  const [markMeta, setMarkMeta] = useState({});
  const [showAll, setShowAll] = useState({ exp: false, tu: false, eq: false });
  const { userId } = useAuth();
  const [sortConfig, setSortConfig] = useState({
    key: "callback_date",
    direction: "desc",
  });
const [tabFilters, setTabFilters] = useState({
  exp: "all",
  tu: "all",
  eq: "all",
});
const DISPUTED_RESULTS = [
  "DISPUTED",
  "PARTLY DISPUTED",
  "STILL UNDER DISPUTE",
  "ACCOUNTS DISPUTED",
];

const DOC_ISSUES = [
  "UNABLE TO DISPUTE INQUIRIES",
  "INVALID FTC",
  "NOT DELETED",
  "DOCUMENTS NOT YET RECEIVED",
  "UNABLE TO PASS AUTHENTICATION",
];

  const [activeTab, setActiveTab] = useState("exp"); // NEW: manage tab state

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);

      const { data, error } = await supabase.from("clients").select(`
        id,
        full_name,
        admin_id,
        exp_completed,
        tu_completed,
        eq_completed,
        paid_at,
        is_paid,
        dont_dispute,
        profiles(full_name),
        marked_clients(client_id, bureau, is_marked, admin_id, profiles:admin_id(full_name)),
        call_logs(
          employee:employee_id(full_name),
          exp_callback_date,
          tu_callback_date,
          eq_callback_date,
          exp_result,
          tu_result,
          eq_result,
          created_at,
          reason
        ),
        document_logs(employee:admin_id(full_name),callback_date, submitted_at)
      `);

      if (error) {
        console.error("Error fetching clients:", error);
        setLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const getLatestDate = (callDateStr, docDateStr) => {
        if (!callDateStr && !docDateStr) return null;
        if (!callDateStr) return docDateStr;
        if (!docDateStr) return callDateStr;
        return new Date(callDateStr) > new Date(docDateStr)
          ? callDateStr
          : docDateStr;
      };

      const enriched = data
        .filter((client) => client.is_paid !== false && client.dont_dispute !== true)
        .map((client) => {
          const paidDate = client.paid_at ? new Date(client.paid_at) : null;
          const paidRunningDays = paidDate
            ? Math.ceil((Date.now() - paidDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          const markedMap = {};
          const metaMap = {};
          client.marked_clients?.forEach((mc) => {
            const key = `${client.id}_${mc.bureau}`;
            markedMap[key] = mc.is_marked;
            if (mc.is_marked && mc.profiles?.full_name) {
              metaMap[key] = { name: mc.profiles.full_name, id: mc.admin_id };
            }
          });

          const latestCall =
            client.call_logs?.sort(
              (a, b) => new Date(b.created_at) - new Date(a.created_at)
            )[0] || {};
          const latestDoc = client.document_logs?.sort(
            (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)
          )[0];
          const docCallbackDate = latestDoc?.callback_date || null;
          const calledBy = latestCall?.employee?.full_name;
          const docsBy = latestDoc?.employee?.full_name;
          const callback_dates = {
            exp_callback_date: getLatestDate(latestCall.exp_callback_date, docCallbackDate),
            tu_callback_date: getLatestDate(latestCall.tu_callback_date, docCallbackDate),
            eq_callback_date: getLatestDate(latestCall.eq_callback_date, docCallbackDate),
          };

          return {
            ...client,
            paidRunningDays,
            markedMap,
            metaMap,
            callback_dates,
            calledBy,
            docsBy,
            submitted_at: latestDoc?.submitted_at || null,
            result_data: {
              exp: latestCall.exp_result || null,
              tu: latestCall.tu_result || null,
              eq: latestCall.eq_result || null,
            },
            call_dates: {
              exp: latestCall.created_at || null,
              tu: latestCall.created_at || null,
              eq: latestCall.created_at || null,
            },
          };
        });

      const categorize = (bureau) => {
        return enriched
          .filter((c) => c[`${bureau}_completed`] === false)
          .map((client) => {
            const callback_date = client.callback_dates?.[`${bureau}_callback_date`] || null;
            const cbDate = callback_date ? new Date(callback_date) : null;
            const isToday = cbDate && cbDate.toDateString() === today.toDateString();

            return {
              ...client,
              callback_date,
              isToday,
            };
          })
          .filter((c) => c.isToday || showAll[bureau])
          .sort((a, b) => {
            if (a.callback_date && !b.callback_date) return -1;
            if (!a.callback_date && b.callback_date) return 1;
            return b.paidRunningDays - a.paidRunningDays;
          });
      };

      const initialMarked = {};
      const initialMeta = {};
      enriched.forEach((client) => {
        Object.assign(initialMarked, client.markedMap);
        Object.assign(initialMeta, client.metaMap);
      });

      setClients({
        exp: categorize("exp"),
        tu: categorize("tu"),
        eq: categorize("eq"),
      });
      setMarked(initialMarked);
      setMarkMeta(initialMeta);
      setLoading(false);
    };

    fetchClients();
  }, [showAll]);

  const toggleMark = async (clientId, bureau) => {
    const key = `${clientId}_${bureau}`;
    const newValue = !marked[key];
    setMarked((prev) => ({ ...prev, [key]: newValue }));

    const { data, error } = await supabase
      .from("marked_clients")
      .upsert(
        { client_id: clientId, admin_id: userId, bureau, is_marked: newValue },
        { onConflict: "client_id,admin_id,bureau" }
      )
      .select("*, profiles:admin_id(full_name)");

    if (error) {
      console.error("Error toggling mark:", error);
    } else if (data?.length > 0) {
      const adminFullName = data[0].profiles?.full_name || "admin";
      const adminId = data[0].admin_id;
      setMarkMeta((prev) => {
        const newMeta = { ...prev };
        if (newValue) {
          newMeta[key] = { name: adminFullName, id: adminId };
        } else {
          delete newMeta[key];
        }
        return newMeta;
      });
    }
  };

const renderTable = (rows, bureau) => {
  const filteredRows = rows.filter((client) => {
    const result = client.result_data?.[bureau]?.toUpperCase?.() || "";
    const filter = tabFilters[bureau];

    if (filter === "disputed") {
      return DISPUTED_RESULTS.includes(result);
    }
    if (filter === "docs") {
      return DOC_ISSUES.includes(result);
    }
    return true;
  });

  return (
    <>
      <div className="d-flex justify-content-end mb-2">
        <Form.Select
          size="sm"
          style={{ width: "200px" }}
          value={tabFilters[bureau]}
          onChange={(e) =>
            setTabFilters((prev) => ({
              ...prev,
              [bureau]: e.target.value,
            }))
          }
        >
          <option value="all">All Clients</option>
          <option value="disputed">Disputed</option>
          <option value="docs">For Docs</option>
        </Form.Select>
      </div>

      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>Mark</th>
            <th>Client Name</th>
            <th onClick={() => requestSort("paidRunningDays")} style={{ cursor: "pointer" }}>
              Paid Days
            </th>
            <th>Assigned</th>
            <th onClick={() => requestSort("submitted_at")} style={{ cursor: "pointer" }}>
              Sent by - Sent Date
            </th>
            <th>Caller - Result - Date</th>
            <th>Reason</th>
            <th onClick={() => requestSort("callback_date")} style={{ cursor: "pointer" }}>
              Callback
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows(filteredRows).map((client) => {
            const key = `${client.id}_${bureau}`;
            return (
              <tr
                key={key}
                className={`${getRowClass(client.paidRunningDays)} ${getMarkClass(
                  client.id,
                  bureau
                )}`}
              >
                <td className="table-narrow text-center">
                  <Form.Check
                    type="checkbox"
                    checked={!!marked[key]}
                    onChange={() => toggleMark(client.id, bureau)}
                    disabled={markMeta[key] && markMeta[key].id !== userId}
                  />
                </td>
                <td>
                  <Link to={`/clients/${client.id}`}>{client.full_name}</Link>
                </td>
                <td>{client.paidRunningDays} days</td>
                <td>
                  {client.admin_id && client.profiles ? (
                    <Link to={`/admin/${client.admin_id}`}>{client.profiles.full_name}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {client.docsBy} -{" "}
                  {client.submitted_at
                    ? new Date(client.submitted_at).toLocaleString()
                    : "—"}
                </td>
                <td>
                  {client.calledBy} - {client.result_data?.[bureau] || "—"}
                  {client.call_dates?.[bureau]
                    ? ` - ${new Date(client.call_dates[bureau]).toLocaleDateString()}`
                    : ""}
                </td>
                <td>{client.reason || "-"}</td>
                <td>
                  {client.callback_date
                    ? new Date(client.callback_date).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="text-center mb-4">
        {!showAll[bureau] && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAll((prev) => ({ ...prev, [bureau]: true }))}
          >
            Show More Clients
          </Button>
        )}
      </div>
    </>
  );
};


  const getRowClass = (days) => {
    if (days > 30) return "bg-red";
    if (days > 20) return "bg-orange";
    if (days > 15) return "bg-yellow";
    return "";
  };

  const getMarkClass = (clientId, bureau) => {
    const key = `${clientId}_${bureau}`;
    const mark = markMeta[key];
    return mark?.name
      ? `mark-admin-${mark.name.toLowerCase().replace(/\s+/g, "-")}`
      : "";
  };

  const sortedRows = (rows) => {
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      if (valA === null) return 1;
      if (valB === null) return -1;
      return valA < valB
        ? sortConfig.direction === "asc"
          ? -1
          : 1
        : valA > valB
        ? sortConfig.direction === "asc"
          ? 1
          : -1
        : 0;
    });
  };

  const requestSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const clearAllMarks = async () => {
    if (!window.confirm("This will clear all marks for all admins. Continue?")) return;
    const { error } = await supabase
      .from("marked_clients")
      .update({ is_marked: false })
      .eq("is_marked", true);
    if (error) return console.error("Error clearing all marks:", error);
    setMarked({});
    setMarkMeta({});
  };

  return (
    <div className="container mt-4 login-container">
      <h2 className="mb-4">❌ Incomplete Clients by Bureau</h2>
      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <>
          <Button variant="outline-danger" className="mb-3" onClick={clearAllMarks}>
            Clear All Marks
          </Button>
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-3"
          >
            <Tab eventKey="exp" title="Experian">
              {renderTable(clients.exp, "exp")}
            </Tab>
            <Tab eventKey="tu" title="TransUnion">
              {renderTable(clients.tu, "tu")}
            </Tab>
            <Tab eventKey="eq" title="Equifax">
              {renderTable(clients.eq, "eq")}
            </Tab>
          </Tabs>
        </>
      )}
    </div>
  );
}
