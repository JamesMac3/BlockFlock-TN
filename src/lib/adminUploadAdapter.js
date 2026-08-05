import { supabase } from "./supabase";

export const adminUploadAdapter = {
  async uploadImage({ file, storagePath }) {
    const { error } = await supabase.storage
      .from("filebucket")
      .upload(storagePath, file, { cacheControl: "3600", contentType: "image/webp", upsert: false });
    if (error) throw error;
    return { storagePath };
  },
  async removeImage({ storagePath }) {
    const { error } = await supabase.storage.from("filebucket").remove([storagePath]);
    if (error) throw error;
  },
};
