-- btree_gist is relocatable. Keep extension objects out of the exposed public schema.
ALTER EXTENSION btree_gist SET SCHEMA extensions;
