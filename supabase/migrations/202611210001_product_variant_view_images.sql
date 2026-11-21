-- Associate front/back product photography with the exact colour/size variant.
-- Applied to the STND Supabase project as product_variant_view_images.
alter table public.product_images
  add column if not exists variant_id bigint references public.product_variants(id) on delete cascade;

alter table public.product_images
  add column if not exists view_type text not null default 'gallery'
  check (view_type in ('front', 'back', 'gallery'));

create index if not exists product_images_variant_sort_idx
  on public.product_images(variant_id, sort_order)
  where variant_id is not null;

create index if not exists product_variants_product_colour_active_idx
  on public.product_variants(product_id, colour, active, size);
