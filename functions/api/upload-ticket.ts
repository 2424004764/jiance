import { jsonReply, readJson } from './oauth/_util'
import { extFromMime, maxBytesFor, randomId } from './_shared'
import { postUpstreamJson } from './_accounting'

/* ============================================================
   POST /api/upload-ticket —— 签发主站统一上传凭证（R2 预签名 PUT）
   鉴权：Bearer access_token 原样透传，由工具站校验（含 storage scope）
   额度：工具站凭证端点原子预扣（不足回 402，附 remaining/need_bytes），
         上传成功后由工具站队列事件按 upload_id 幂等实扣；
         放弃上传无需释放——预扣 15 分钟自动失效
   key：  subsite/{uid}/{upload_id}/{uuid}.{ext}（统一格式，工具站队列
         只结算这个格式，对象落在主站为应用登记的专属 R2 桶；
         末段为本站生成的随机 UUID，不透传用户原始文件名——
         空格等字符在预签名 URL 与 /f/ 取图间会产生编码歧义）
   依赖：无需本站自持 R2 密钥（旧 SigV4 自签通道已下线）
   ============================================================ */

export const onRequestPost = async ({ request }: { request: Request }): Promise<Response> => {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '请先登录后再上传' }, 401)
  }

  // 1. 请求体：{ content_type, size, filename }
  const body = await readJson(request)
  const contentType = typeof body?.content_type === 'string' ? body.content_type.toLowerCase() : ''
  const ext = extFromMime(contentType)
  const size = typeof body?.size === 'number' ? body.size : 0
  if (!ext) {
    return jsonReply(
      { error: 'invalid_request', error_description: '仅支持图片（jpeg/png/webp/gif 等）与短视频（MP4）' },
      400,
    )
  }
  if (size <= 0) {
    return jsonReply({ error: 'invalid_request', error_description: '文件内容为空' }, 400)
  }
  const maxBytes = maxBytesFor(contentType)
  if (size > maxBytes) {
    const cap = Math.round(maxBytes / 1024 / 1024)
    return jsonReply(
      { error: 'invalid_request', error_description: `单个文件不能超过 ${cap}MB` },
      400,
    )
  }

  // 2. 向工具站申请统一上传凭证（内部完成原子预扣；401/402/403 原样透传，
  //    402 附 remaining_bytes / need_bytes 供前端展示差额）
  //    对象名末段用随机 UUID：展示标题由前端清单自存，不依赖对象名；
  //    原始文件名（如 "image (1).png"）进 key 会让 URL 带 %20 等编码，
  //    预签名写入与 /f/ 读取的解码路径不一致时会 404
  const filename = `${randomId()}.${ext}`
  const cred = await postUpstreamJson('storage-upload-credential', auth, {
    filename,
    bytes: size,
    content_type: contentType,
  })
  if (cred.status !== 200 || typeof cred.data?.upload_url !== 'string' || typeof cred.data?.object_key !== 'string') {
    return jsonReply(
      cred.data ?? { error: 'server_error', error_description: '上传凭证签发失败，请稍后重试' },
      cred.status === 200 ? 502 : cred.status,
    )
  }

  // 3. 按本站前端既有约定回包：浏览器 PUT upload.url（Content-Type 必须与签名一致）
  const objectKey = cred.data.object_key
  return jsonReply({
    key: objectKey,
    url: `/f/${objectKey}`,
    upload: { method: 'PUT', url: cred.data.upload_url, headers: { 'content-type': contentType } },
    expires_in: typeof cred.data.expires_in === 'number' ? cred.data.expires_in : 900,
  })
}
