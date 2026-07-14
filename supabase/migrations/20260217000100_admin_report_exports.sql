-- Admin report export helpers and RPC

CREATE OR REPLACE FUNCTION public.jsonb_array_to_csv(p_rows jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_headers text[];
  v_header_line text;
  v_body text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN '';
  END IF;

  SELECT array_agg(key ORDER BY key)
  INTO v_headers
  FROM jsonb_each((p_rows->0)::jsonb);

  v_header_line := array_to_string(v_headers, ',');

  SELECT string_agg(
    (
      SELECT string_agg(
        '"' || replace(COALESCE(elem->>header, ''), '"', '""') || '"',
        ','
      )
      FROM unnest(v_headers) AS header
    ),
    E'\n'
  )
  INTO v_body
  FROM jsonb_array_elements(p_rows) AS elem;

  RETURN v_header_line || E'\n' || COALESCE(v_body, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_report_export(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_tenant_company text,
  p_format text DEFAULT 'csv'
)
RETURNS TABLE(
  filename text,
  mime_type text,
  payload text,
  generated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_format text := lower(COALESCE(p_format, 'csv'));
  v_range_end timestamptz;
  v_tenant_company text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can export reports';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF v_format NOT IN ('csv', 'json') THEN
    RAISE EXCEPTION 'Unsupported format: %', p_format;
  END IF;

  v_tenant_company := NULLIF(trim(p_tenant_company), '');
  IF v_tenant_company IS NULL THEN
    RAISE EXCEPTION 'Tenant company is required';
  END IF;

  v_range_end := (p_end_date::timestamptz + interval '1 day');

  CASE p_report_type
    WHEN 'users' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          p.id,
          p.email,
          p.full_name,
          p.phone,
          p.company_name,
          p.user_type,
          p.created_at,
          COUNT(j.id)::int AS job_count,
          COALESCE(SUM(j.cost_incl_tax), 0)::numeric(12,2) AS total_job_value,
          MAX(j.created_at) AS last_job_at
        FROM public.profiles p
        LEFT JOIN public.jobs j ON j.customer_id = p.id
        WHERE p.company_name = v_tenant_company
          AND p.created_at >= p_start_date::timestamptz
          AND p.created_at < v_range_end
        GROUP BY p.id, p.email, p.full_name, p.phone, p.company_name, p.user_type, p.created_at
        ORDER BY p.created_at DESC
      ) export_rows;

    WHEN 'jobs' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          j.id,
          j.job_number,
          j.name,
          j.status,
          j.cost_excl_tax,
          j.cost_incl_tax,
          j.completion_date,
          j.created_at,
          j.updated_at,
          p.id AS customer_id,
          p.full_name AS customer_name,
          p.email AS customer_email,
          p.company_name AS customer_company,
          p.user_type AS customer_type
        FROM public.jobs j
        INNER JOIN public.profiles p ON p.id = j.customer_id
        WHERE p.company_name = v_tenant_company
          AND j.created_at >= p_start_date::timestamptz
          AND j.created_at < v_range_end
        ORDER BY j.created_at DESC
      ) export_rows;

    WHEN 'pricing_history' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          ph.id,
          ph.product_id,
          pr.sku AS product_sku,
          pr.name AS product_name,
          ph.old_price,
          ph.new_price,
          ph.changed_at,
          ph.changed_by,
          changed_profile.full_name AS changed_by_name,
          changed_profile.email AS changed_by_email,
          changed_profile.company_name AS changed_by_company
        FROM public.price_history ph
        LEFT JOIN public.products pr ON pr.id = ph.product_id
        LEFT JOIN public.profiles changed_profile ON changed_profile.id = ph.changed_by
        WHERE changed_profile.company_name = v_tenant_company
          AND ph.changed_at >= p_start_date::timestamptz
          AND ph.changed_at < v_range_end
        ORDER BY ph.changed_at DESC
      ) export_rows;

    ELSE
      RAISE EXCEPTION 'Unsupported report type: %', p_report_type;
  END CASE;

  RETURN QUERY
  SELECT
    format('%s_%s_%s.%s', p_report_type, replace(v_tenant_company, ' ', '-'), to_char(now(), 'YYYYMMDD_HH24MISS'), v_format),
    CASE WHEN v_format = 'csv' THEN 'text/csv' ELSE 'application/json' END,
    CASE WHEN v_format = 'csv' THEN public.jsonb_array_to_csv(v_rows) ELSE jsonb_pretty(v_rows) END,
    now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_report_export(text, date, date, text, text) TO authenticated;
