import { supabase } from './supabase'

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

export async function uploadCardImage(file: File, path: string): Promise<string | null> {
  const { error } = await supabase.storage.from('card-images').upload(path, file, { upsert: true })
  if (error) return null
  return supabase.storage.from('card-images').getPublicUrl(path).data.publicUrl
}
