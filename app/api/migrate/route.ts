import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { sql } = await request.json();

    if (!sql) {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    // Try to run SQL via exec_sql function
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql });

      if (error) {
        // If exec_sql function doesn't exist, create it first
        if (error.message?.includes('function') || error.code === 'PGRST202') {
          // Create exec_sql function
          const createFunctionSql = `
            CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
            RETURNS VOID
            LANGUAGE plpgsql
            SECURITY DEFINER
            AS $$
            BEGIN
              EXECUTE sql;
            END;
            $$;
          `;

          // We can't run this via RPC, so we need to use a different approach
          // For now, return an error with instructions
          return NextResponse.json(
            {
              error: 'exec_sql function does not exist. Please create it manually in Supabase Dashboard.',
              sql: createFunctionSql
            },
            { status: 500 }
          );
        }
        throw error;
      }

      return NextResponse.json({ success: true, data });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
