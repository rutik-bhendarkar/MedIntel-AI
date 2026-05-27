const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://wrpzzzppztwcwpouzffe.supabase.co";

const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndycHp6enBwenR3Y3dwb3V6ZmZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTExNTQsImV4cCI6MjA5NTM4NzE1NH0.SogoAXc8ay93WnCNnObcxcQz7yreymvsy4KTcpkNrcU";

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;