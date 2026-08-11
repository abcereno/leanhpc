import { useState } from 'react';
import { supabase } from '../supabaseClient';

export function useAddCompanyForm() {
  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState(''); // New state for email
  const [message, setMessage] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!companyName.trim() || !contactEmail.trim()) {
      return setMessage('❌ Company name and contact email are required.');
    }

    setSubmitting(true);

    try {
      // Use an Edge Function to handle the creation and invitation securely
      const { data, error } = await supabase.functions.invoke('create-company-and-invite', {
        body: {
          companyName: companyName.trim(),
          email: contactEmail.trim(),
        },
      });

      if (error) {
        // The function will throw an error for network issues, etc.
        throw new Error(error.message);
      }

      if (data.error) {
        // The function's internal logic might return a specific error message
        throw new Error(data.error);
      }
      
      setMessage(`✅ Company '${companyName}' created and invitation sent to ${contactEmail}.`);
      setCompanyName('');
      setContactEmail('');
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    companyName,
    setCompanyName,
    contactEmail,
    setContactEmail,
    message,
    isSubmitting,
    handleSubmit,
  };
}