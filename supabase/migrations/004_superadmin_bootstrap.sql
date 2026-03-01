-- 004 — Bootstrap STREFEX superadmin role and signup behavior

-- Ensure signup trigger assigns superadmin role to the designated STREFEX account.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN lower(NEW.email) = 'strefex@strfgroup.ru' THEN 'superadmin'
      ELSE 'user'
    END
  );
  RETURN NEW;
END;
$$;

-- Promote existing STREFEX account (if present) to superadmin.
UPDATE public.profiles
SET role = 'superadmin'
WHERE lower(email) = 'strefex@strfgroup.ru';
