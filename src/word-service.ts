import * as fs from 'fs';
import mammoth from 'mammoth';

/**
 * Đọc file Word (.docx) và convert sang HTML bằng mammoth.
 * Bảng trong Word sẽ được chuyển thành <table><tr><td>...</td></tr></table>.
 */
export async function readWordAsHtml(filePath: string): Promise<string> {
  const result = await mammoth.convertToHtml({ path: filePath });
  return result.value; // result.messages chứa warnings (bỏ qua)
}

/**
 * Làm sạch HTML cho TFS để field System.Description render được "dễ nuốt".
 * - Bỏ class (mammoth sinh class nhưng không có CSS đi kèm).
 * - Bơm border + style cho <table>, <td>, <th> để bảng hiện rõ trên TFS.
 * - Loại bỏ tag nguy hiểm (<script>, <style>).
 * Toàn bộ là biến đổi chuỗi/regex, không cần thư viện ngoài.
 */
export function sanitizeHtmlForTfs(html: string): string {
  let out = html;

  // 1. Bỏ các tag nguy hiểm cùng nội dung
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 2. Bỏ mọi attribute class="..."
  out = out.replace(/\s+class="[^"]*"/gi, '');
  out = out.replace(/\s+class='[^']*'/gi, '');

  // 3. Bơm style cho <table> (xử lý cả table đã có/không có attribute sẵn)
  out = out.replace(/<table[^>]*>/gi,
    '<table border="1" style="border-collapse:collapse;width:100%">');

  // 4. Bơm border + padding cho <td> và <th>
  out = out.replace(/<td[^>]*>/gi,
    '<td style="border:1px solid #ccc;padding:4px">');
  out = out.replace(/<th[^>]*>/gi,
    '<th style="border:1px solid #ccc;padding:4px;background:#f2f2f2">');

  // 5. Gọn khoảng trắng thừa giữa các tag
  out = out.replace(/>\s+</g, '><').trim();

  return out;
}

/**
 * Kiểm tra file Word hợp lệ (tồn tại + đuôi .docx).
 * Trả về thông báo lỗi nếu không hợp lệ, hoặc null nếu OK.
 */
export function validateWordFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return `File không tồn tại: ${filePath}`;
  }
  if (!filePath.toLowerCase().endsWith('.docx')) {
    return `File phải có định dạng .docx (nhận được: ${filePath})`;
  }
  return null;
}

/**
 * Strip HTML tags + decode entity cơ bản + gọn whitespace.
 * Dùng để so sánh nội dung "thực" giữa HTML gửi đi và HTML đọc về
 * (TFS chuẩn hóa lại HTML nên KHÔNG so sánh chuỗi raw được).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')        // bỏ tag
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')            // gọn whitespace
    .trim();
}

/**
 * So sánh độ dài plain-text giữa HTML đã gửi và HTML TFS lưu lại.
 * ok = true nếu storedLen >= sentLen * 0.95 (cho phép sai số nhỏ do normalize).
 */
export function verifyContentLength(
  sent: string,
  stored: string
): { ok: boolean; sentLen: number; storedLen: number; ratio: number } {
  const sentLen = htmlToPlainText(sent).length;
  const storedLen = htmlToPlainText(stored || '').length;
  const ratio = sentLen === 0 ? 1 : storedLen / sentLen;
  return { ok: ratio >= 0.95, sentLen, storedLen, ratio };
}
