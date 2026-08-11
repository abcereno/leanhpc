import React, { useState } from 'react';
import { Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { supabase } from '../../../../supabaseClient'; // Adjust path if needed
import { useAuth } from '../../../../context/AuthContext'; // Adjust path if needed

export default function NotesTab({ client, clientId, onRefresh }) {
    const { fullName } = useAuth(); // Grab the logged-in CS rep's name
    const [newNote, setNewNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        setSaving(true);
        setMessage(null);

        try {
            // 1. Create the timestamp and header
            const timestamp = new Date().toLocaleString();
            const author = fullName || "Staff";
            const formattedNewNote = `--- Added on ${timestamp} by ${author} ---\n${newNote.trim()}`;
            
            // 2. Append the new note to the existing notes
            const existingNotes = client?.special_instructions_notes || "";
            const combinedNotes = existingNotes 
                ? `${existingNotes}\n\n${formattedNewNote}` 
                : formattedNewNote;

            // 3. Update Supabase
            const { error } = await supabase
                .from('clients')
                .update({ special_instructions_notes: combinedNotes })
                .eq('id', clientId);

            if (error) throw error;

            // 4. Success handling
            setMessage({ type: 'success', text: 'Note appended successfully!' });
            setNewNote(""); // Clear the text box
            
            // Trigger the dashboard to re-fetch the client data so the UI updates instantly
            if (onRefresh) onRefresh(); 
            
        } catch (err) {
            console.error("Error saving note:", err);
            setMessage({ type: 'danger', text: "Failed to save note: " + err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border-0 shadow-sm h-100">
            <Card.Body className="d-flex flex-column" style={{ minHeight: '500px' }}>
                <h5 className="fw-bold mb-3">Special Instructions & Notes</h5>
                
                {message && (
                    <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>
                        {message.text}
                    </Alert>
                )}

                {/* Display Existing Notes */}
                <div className="flex-grow-1 overflow-auto mb-4 p-3 bg-light rounded border">
                    {client?.special_instructions_notes ? (
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.95rem', margin: 0 }}>
                            {client.special_instructions_notes}
                        </pre>
                    ) : (
                        <div className="text-muted text-center mt-5">
                            <i className="bi bi-journal-text display-4 opacity-50 mb-2 d-block"></i>
                            <p>No notes found for this client.</p>
                        </div>
                    )}
                </div>

                {/* Add New Note Form */}
                <Form onSubmit={handleAddNote}>
                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold small text-muted text-uppercase">Append New Note</Form.Label>
                        <Form.Control 
                            as="textarea" 
                            rows={3} 
                            placeholder="Type your new note here..." 
                            value={newNote} 
                            onChange={(e) => setNewNote(e.target.value)} 
                            disabled={saving}
                        />
                    </Form.Group>
                    <div className="text-end">
                        <Button type="submit" variant="primary" disabled={saving || !newNote.trim()} className="fw-bold px-4">
                            {saving ? (
                                <Spinner size="sm" animation="border" className="me-2" />
                            ) : (
                                <i className="bi bi-journal-plus me-2"></i>
                            )}
                            Add Note
                        </Button>
                    </div>
                </Form>
            </Card.Body>
        </Card>
    );
}