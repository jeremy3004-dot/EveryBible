# Supabase Sync

Manage Supabase database schema, migrations, and local development environment.

## Prerequisites

- Docker Desktop installed and running (for local Supabase)
- Supabase CLI installed: `npm install -g supabase`
- Supabase project created at https://supabase.com
- `.env` file with Supabase credentials

## Local Development Setup

### Start Local Supabase
```bash
# Start local Supabase instance (requires Docker)
supabase start

# This starts:
# - PostgreSQL database
# - Auth server
# - Realtime server
# - Storage server
# - REST API
```

### Check Status
```bash
# View local Supabase status and URLs
supabase status

# Output includes:
# - API URL
# - DB URL
# - Studio URL (local dashboard)
# - Anon key
# - Service role key
```

### Stop Local Supabase
```bash
# Stop all Supabase containers
supabase stop

# Stop and remove all data
supabase stop --no-backup
```

## Database Migrations

### Create New Migration
```bash
# Create a new migration file
supabase migration new <migration_name>

# Example: Add a new table
supabase migration new add_user_streaks_table

# This creates: supabase/migrations/YYYYMMDDHHMMSS_add_user_streaks_table.sql
```

### Apply Migrations Locally
```bash
# Reset local database and apply all migrations
supabase db reset

# This will:
# - Drop all tables
# - Re-run all migrations in order
# - Seed data if seed.sql exists
```

### Push Migrations to Remote
```bash
# Link to remote project (first time only)
supabase link --project-ref <your-project-ref>

# Push migrations to production
supabase db push

# CAUTION: This modifies production database!
# Always test locally first with `supabase db reset`
```

### Pull Remote Schema
```bash
# Generate migrations from remote database
supabase db pull

# Use this to sync local dev with production schema
```

## Useful Commands

### Access Database
```bash
# Open psql shell for local database
supabase db psql

# Run SQL file
supabase db psql < query.sql

# Dump database schema
supabase db dump -f schema.sql --schema public
```

### View Logs
```bash
# View all logs
supabase logs

# View auth logs
supabase logs auth

# View database logs
supabase logs db
```

### Generate Types
```bash
# Generate TypeScript types from database schema
supabase gen types typescript --local > src/types/supabase.ts

# For remote database
supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
```

## Database Schema

### Core Tables

**profiles**
- User profile information
- Links to auth.users (one-to-one)
- Columns: id, email, display_name, avatar_url, preferences, created_at, updated_at

**user_progress**
- Reading progress and course completion
- Columns: id, user_id, verses_read, courses_completed, time_spent, last_sync, data (JSONB)

**groups**
- Study groups
- Columns: id, name, description, leader_id, created_at, updated_at

**group_members**
- Group membership (many-to-many)
- Columns: id, group_id, user_id, role, joined_at

**group_sessions**
- Session records
- Columns: id, group_id, field_number, date, notes, attendance (JSONB), created_at

### Row Level Security (RLS)

All tables have RLS policies:
- Users can read their own data
- Users can update their own profiles
- Group leaders can manage their groups
- Group members can view group data

**Never disable RLS in production!**

## Common Workflows

### Adding a New Feature with Database Changes

1. **Start local Supabase:**
   ```bash
   supabase start
   ```

2. **Create migration:**
   ```bash
   supabase migration new add_feature_table
   ```

3. **Edit migration file:**
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_add_feature_table.sql
   CREATE TABLE IF NOT EXISTS public.feature (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     data JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Enable RLS
   ALTER TABLE public.feature ENABLE ROW LEVEL SECURITY;

   -- RLS Policy: Users can only access their own data
   CREATE POLICY "Users can access own data"
   ON public.feature
   FOR ALL
   USING (auth.uid() = user_id);
   ```

4. **Apply migration locally:**
   ```bash
   supabase db reset
   ```

5. **Generate TypeScript types:**
   ```bash
   supabase gen types typescript --local > src/types/supabase.ts
   ```

6. **Test locally with app:**
   ```bash
   npm start
   # Update .env to use local Supabase URL temporarily
   ```

7. **Push to production when ready:**
   ```bash
   supabase db push
   ```

### Syncing with Production Database

```bash
# Pull production schema changes
supabase db pull

# This generates migrations from prod changes
# Review migrations before applying

# Apply to local
supabase db reset

# Generate updated types
supabase gen types typescript --local > src/types/supabase.ts
```

### Resetting Local Database

```bash
# Reset to clean state
supabase db reset

# Reset and skip seed data
supabase db reset --no-seed

# Reset specific migration
supabase migration repair <migration_version>
```

## Troubleshooting

### Docker Not Running
```bash
# Check Docker status
docker ps

# Start Docker Desktop
open /Applications/Docker.app
```

### Port Conflicts
Supabase uses ports: 54322 (PostgreSQL), 54323 (Auth), 54321 (API)

```bash
# Check what's using ports
lsof -i :54322
lsof -i :54323
lsof -i :54321

# Stop conflicting services or change ports in config.toml
```

### Migration Errors
```bash
# View migration history
supabase migration list

# Repair specific migration
supabase migration repair <timestamp>

# Manually fix in database, then update migration file
```

### Connection Issues
```bash
# Test connection
supabase db ping

# Re-link project
supabase link --project-ref <your-project-ref>

# Check credentials in .env
```

### RLS Policy Issues
```bash
# Test RLS policies in Supabase Studio
# Or temporarily disable for testing (NEVER in production):
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;

# Re-enable after debugging:
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

## Environment Variables

### Local Development
When using local Supabase, update `.env`:
```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<get from supabase status>
```

### Production
Use production credentials from Supabase dashboard:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<prod anon key>
```

**Never commit production credentials to git!**

## Best Practices

1. **Always test migrations locally first:**
   ```bash
   supabase db reset
   # Test with app
   # Only then: supabase db push
   ```

2. **Use RLS policies for all tables:**
   Security first. Users should only access their own data.

3. **Write reversible migrations:**
   Include both UP and DOWN migrations when possible.

4. **Generate types after schema changes:**
   Keeps TypeScript types in sync with database.

5. **Use transactions for complex migrations:**
   ```sql
   BEGIN;
   -- migration steps
   COMMIT;
   ```

6. **Document complex queries:**
   Add comments in migration files explaining business logic.

7. **Backup before major changes:**
   Use Supabase dashboard to create backups.

## Useful Resources

- Supabase Dashboard: https://app.supabase.com
- Supabase Docs: https://supabase.com/docs
- Local Studio: http://localhost:54323 (when running)
- SQL Editor: Available in Supabase Studio
- Database Logs: Supabase Dashboard > Logs
