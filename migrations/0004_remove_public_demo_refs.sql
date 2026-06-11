-- Remove legacy local demo asset references after moving all pages to Worker SSR.
UPDATE posts
SET content = REPLACE(
  content,
  '/demo/forum-layout.svg',
  'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80'
)
WHERE content LIKE '%/demo/forum-layout.svg%';
