import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY environment variables.');
}

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { error } = await client.rpc('seed_sample_data');

  if (error) {
    throw new Error(`RPC seed failed: ${error.message}`);
  }

  console.log('Seed completed successfully via seed_sample_data RPC.');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
