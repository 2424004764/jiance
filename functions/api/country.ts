import { jsonReply } from '../api/oauth/_util'

/** GET /api/country —— 返回 Cloudflare 边缘节点识别的访客国家码（如 CN / US） */
export const onRequestGet = ({ request }: { request: Request }): Response => {
  const header = request.headers.get('CF-IPCountry') ?? ''
  const cf = (request as { cf?: { country?: string } }).cf
  return jsonReply({ country: header || cf?.country || '' })
}
