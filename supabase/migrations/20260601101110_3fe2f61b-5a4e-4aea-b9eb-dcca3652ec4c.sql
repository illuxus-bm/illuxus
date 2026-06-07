UPDATE public.events SET currency = 'INR' WHERE currency IS NULL OR currency = '';
UPDATE public.events SET timezone = 'Asia/Kolkata' WHERE timezone IS NULL OR timezone = '';