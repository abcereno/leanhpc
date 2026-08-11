import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../supabaseClient';
import { Card, Form, Button, Spinner } from 'react-bootstrap';

export const MessagesTab = ({ clientId }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");

  // Fetch messages when tab loads
  useEffect(() => {
    if (!clientId) return;
    
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('communications')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true }); // Oldest to newest
        
      setMessages(data || []);
      setLoading(false);
    };

    fetchMessages();

    // Bonus: Supabase Realtime so it pops up instantly without refreshing!
    const channel = supabase.channel('realtime_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications', filter: `client_id=eq.${clientId}` }, 
      (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [clientId]);

  const sendReply = async (e) => {
      e.preventDefault();
      if (!reply.trim()) return;
      
      // 1. Insert to Supabase (so it shows in UI instantly)
      await supabase.from('communications').insert({
          client_id: clientId,
          direction: 'outbound',
          type: 'sms',
          body: reply
      });

      // 2. Send to GHL (See Step 4 below)
      // fetch('YOUR_GHL_OUTBOUND_WEBHOOK', { ... })

      setReply("");
  }

  if (loading) return <Spinner animation="border" />;

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body className="d-flex flex-column" style={{ height: '500px' }}>
        {/* Message History */}
        <div className="flex-grow-1 overflow-auto mb-3 d-flex flex-column gap-2">
           {messages.length === 0 ? <p className="text-muted text-center mt-5">No messages yet.</p> : null}
           
           {messages.map(msg => (
               <div key={msg.id} className={`p-2 rounded ${msg.direction === 'inbound' ? 'bg-light align-self-start' : 'bg-primary text-white align-self-end'}`} style={{ maxWidth: '75%' }}>
                   <small className="d-block fw-bold opacity-75" style={{ fontSize: '0.7rem' }}>{msg.type.toUpperCase()} • {new Date(msg.created_at).toLocaleTimeString()}</small>
                   {msg.body}
               </div>
           ))}
        </div>

        {/* Reply Box */}
        <Form onSubmit={sendReply} className="d-flex gap-2">
            <Form.Control type="text" placeholder="Type an SMS reply..." value={reply} onChange={(e) => setReply(e.target.value)} />
            <Button type="submit" variant="primary">Send</Button>
        </Form>
      </Card.Body>
    </Card>
  );
}

export default MessagesTab;