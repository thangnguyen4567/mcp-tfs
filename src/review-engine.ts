import * as fs from 'fs';

/**
 * Đọc và parse rules từ các file cấu hình.
 * Hỗ trợ: plain text / markdown
 */
export function loadRulesFromFiles(filePaths: string[]): string {
  if (filePaths.length === 0) {
    return '(Không có rules file nào được cấu hình)';
  }

  const sections: string[] = [];
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      sections.push(`## Rules từ file: ${fileName}\n\n${content}`);
    } catch (err) {
      sections.push(`## Rules từ file: ${filePath}\n\n(Lỗi đọc file: ${err})`);
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Xác định loại file từ extension để áp dụng rule phù hợp
 */
export function detectFileType(filePath: string): 'frontend' | 'backend' | 'other' {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const feExtensions = ['ts', 'html', 'scss', 'css', 'component.ts', 'service.ts'];
  const beExtensions = ['cs', 'java', 'go', 'py', 'rb'];

  if (feExtensions.some((e) => filePath.endsWith(`.${e}`)) || ext === 'ts' || ext === 'html' || ext === 'scss') {
    return 'frontend';
  }
  if (beExtensions.includes(ext)) {
    return 'backend';
  }
  return 'other';
}

/**
 * Tóm tắt các thay đổi files để review
 */
export function summarizeChanges(
  changeEntries: Array<{ changeType: string; item: { path: string; isFolder?: boolean } }>
): { path: string; changeType: string; type: 'frontend' | 'backend' | 'other' }[] {
  return changeEntries
    .filter((c) => !c.item.isFolder)
    .map((c) => ({
      path: c.item.path,
      changeType: c.changeType,
      type: detectFileType(c.item.path),
    }));
}

/**
 * Build system prompt cho review FE Angular 19
 */
export function buildReviewSystemPrompt(rules: string, codeType: 'frontend' | 'backend' | 'all'): string {
  const basePrompt = `Bạn là một senior code reviewer chuyên nghiệp.
Nhiệm vụ của bạn là review code và đưa ra nhận xét cụ thể, actionable.

Phong cách review:
- Nhận xét rõ ràng, cụ thể tới file/line
- Phân loại: [CRITICAL] / [WARNING] / [SUGGESTION] / [INFO]
- Giải thích TẠI SAO cần thay đổi
- Đề xuất code mẫu cụ thể khi cần
- Ưu tiên các vấn đề quan trọng nhất

Format output cho mỗi vấn đề:
\`\`\`
[LEVEL] <tên vấn đề ngắn gọn>
File: <đường dẫn file>
Dòng: <số dòng nếu có>
Vấn đề: <mô tả vấn đề>
Gợi ý: <cách fix hoặc code mẫu>
\`\`\`
`;

  const typePrompt =
    codeType === 'frontend'
      ? '\nTập trung review Angular 19 Frontend code theo các rules sau:\n'
      : codeType === 'backend'
        ? '\nTập trung review Backend code theo các rules sau:\n'
        : '\nReview toàn bộ code (Frontend + Backend) theo các rules sau:\n';

  return basePrompt + typePrompt + '\n' + rules;
}

/**
 * Xây dựng prompt review cho từng file
 */
export function buildFileReviewPrompt(
  filePath: string,
  changeType: string,
  fileContent: string,
  maxLength = 8000
): string {
  const truncated = fileContent.length > maxLength
    ? fileContent.substring(0, maxLength) + '\n\n... (file bị cắt bớt, quá dài)'
    : fileContent;

  return `Review file sau (${changeType}):
File: ${filePath}

\`\`\`
${truncated}
\`\`\`

Hãy kiểm tra:
1. Có vi phạm rules/chuẩn không?
2. Có lỗi logic, performance, security không?
3. Code có đọc được, maintainable không?
4. Có thiếu error handling không?

Trả về danh sách các vấn đề (nếu không có vấn đề gì thì ghi "✅ File này OK").`;
}

/**
 * Parse review output thành danh sách comments để post lên TFS
 */
export interface ReviewComment {
  filePath: string;
  line?: number;
  content: string;
  level: 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'INFO';
}

export function parseReviewOutput(
  reviewText: string,
  defaultFilePath: string
): ReviewComment[] {
  const comments: ReviewComment[] = [];

  // Skip nếu file OK
  if (reviewText.includes('✅ File này OK')) {
    return comments;
  }

  // Parse từng block comment
  const blockRegex = /\[(CRITICAL|WARNING|SUGGESTION|INFO)\]([^\n]+)\n([\s\S]*?)(?=\[(CRITICAL|WARNING|SUGGESTION|INFO)\]|$)/g;
  let match;

  while ((match = blockRegex.exec(reviewText)) !== null) {
    const level = match[1] as ReviewComment['level'];
    const title = match[2].trim();
    const body = match[3].trim();

    // Extract line number nếu có
    const lineMatch = body.match(/Dòng:\s*(\d+)/i);
    const lineNum = lineMatch ? parseInt(lineMatch[1]) : undefined;

    // Extract file path nếu có
    const fileMatch = body.match(/File:\s*([^\n]+)/i);
    const filePath = fileMatch ? fileMatch[1].trim() : defaultFilePath;

    // Build comment content
    const content = `[${level}] **${title}**\n\n${body}`;

    comments.push({ filePath, line: lineNum, content, level });
  }

  // Fallback: nếu không parse được, tạo 1 comment tổng hợp
  if (comments.length === 0 && reviewText.trim().length > 10) {
    comments.push({
      filePath: defaultFilePath,
      content: reviewText.trim(),
      level: 'INFO',
    });
  }

  return comments;
}
