import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function useCompanyDirectory() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCompanies = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, created_at')
        .order('created_at', { ascending: true });

      if (error) {
        setError('Failed to load companies.');
        console.error(error);
      } else {
        setCompanies(data);
      }
      setLoading(false);
    };

    fetchCompanies();
  }, []); // Empty dependency array means this runs once on mount

  return { companies, loading, error };
}