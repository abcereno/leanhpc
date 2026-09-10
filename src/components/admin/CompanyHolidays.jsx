import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";
import {
  Card,
  Table,
  Form,
  Button,
  Alert,
  Spinner,
  Row,
  Col,
  Badge,
} from "react-bootstrap";

export default function CompanyHolidays() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form State
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchHolidays();
  }, []);

  async function fetchHolidays() {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_holidays")
      .select("*")
      .order("date", { ascending: true }); // Show earliest dates first

    if (error) {
      console.error("Error fetching holidays:", error);
    } else {
      setHolidays(data || []);
    }
    setLoading(false);
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    setErrorMsg("");
    if (!date || !description) return;

    setSubmitting(true);

    // Upsert allows updating the description if the date already exists
    const { error } = await supabase
      .from("company_holidays")
      .upsert([{ date, description }])
      .select();

    if (error) {
      setErrorMsg("❌ Failed to save holiday: " + error.message);
    } else {
      // Success: Reset form and refresh list
      setDate("");
      setDescription("");
      await fetchHolidays();
    }
    setSubmitting(false);
  }

  async function handleDelete(dateToDelete) {
    if (!(await confirm(`Are you sure you want to remove the holiday on ${dateToDelete}?`))) {
      return;
    }

    const { error } = await supabase
      .from("company_holidays")
      .delete()
      .eq("date", dateToDelete);

    if (error) {
      addToast({ title: "Delete Failed", message: "Error deleting holiday: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } else {
      // Optimistic update: remove from UI immediately
      setHolidays((prev) => prev.filter((h) => h.date !== dateToDelete));
    }
  }

  // Helper to check if a date is in the past
  const isPast = (dateStr) => {
    return new Date(dateStr) < new Date().setHours(0, 0, 0, 0);
  };

  return (
    <Card className="shadow-sm mb-4">
      <Card.Header className="bg-white py-3">
        <h5 className="mb-0 text-primary">
          <i className="bi bi-calendar-event me-2"></i>
          Company Holidays & Closures
        </h5>
      </Card.Header>
      <Card.Body>
        <p className="text-muted small">
          Days added here will be excluded from "Business Day" calculations for payroll and deadlines.
        </p>

        {/* --- ADD HOLIDAY FORM --- */}
        <Form onSubmit={handleAddHoliday} className="mb-4 p-3 bg-light rounded border">
          <h6 className="fw-bold mb-3">Add New Holiday</h6>
          {errorMsg && <Alert variant="danger" className="py-2">{errorMsg}</Alert>}
          
          <Row className="g-2 align-items-end">
            <Col md={4}>
              <Form.Label className="small fw-bold">Date</Form.Label>
              <Form.Control
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Col>
            <Col md={6}>
              <Form.Label className="small fw-bold">Description</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Christmas Day, Office Renovation..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </Col>
            <Col md={2}>
              <Button 
                type="submit" 
                variant="primary" 
                className="w-100 fw-bold"
                disabled={submitting}
              >
                {submitting ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-plus-lg"></i> Add</>}
              </Button>
            </Col>
          </Row>
        </Form>

        {/* --- HOLIDAY LIST --- */}
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-calendar-check fs-1 opacity-50"></i>
            <p className="mt-2">No holidays set. Business as usual!</p>
          </div>
        ) : (
          <div className="table-responsive">
            <Table hover align="middle">
              <thead className="bg-light text-secondary small text-uppercase">
                <tr>
                  <th style={{ width: "25%" }}>Date</th>
                  <th style={{ width: "55%" }}>Occasion</th>
                  <th style={{ width: "20%" }} className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => {
                  const past = isPast(h.date);
                  return (
                    <tr key={h.date} className={past ? "text-muted bg-light opacity-75" : ""}>
                      <td>
                        <span className="fw-medium font-monospace">
                          {new Date(h.date + 'T12:00:00').toLocaleDateString(undefined, {
                            weekday: 'short', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric'
                          })}
                        </span>
                      </td>
                      <td>
                        {h.description}
                        {past && <Badge bg="secondary" className="ms-2" style={{fontSize: '0.65rem'}}>PASSED</Badge>}
                      </td>
                      <td className="text-end">
                        <Button 
                          variant="outline-danger" 
                          size="sm" 
                          onClick={() => handleDelete(h.date)}
                          title="Delete Holiday"
                        >
                          <i className="bi bi-trash"></i>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}