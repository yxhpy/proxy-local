#!/bin/bash

# --- 在这里配置你的信息 ---
API_TOKEN="<YOUR_CLOUDFLARE_API_TOKEN>"
ZONE_NAME="<YOUR_DOMAIN_NAME>" # 例如: yxhpy.xyz
RECORD_NAME="<THE_DNS_RECORD_TO_DELETE>" # 例如: test.yxhpy.xyz
# --------------------------

# 检查 jq 是否安装
if ! command -v jq &> /dev/null
then
    echo "错误: 本脚本需要 'jq' 工具来处理 JSON。请先安装 jq。"
    exit 1
fi

echo "正在获取 Zone ID for ${ZONE_NAME}..."
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ "${ZONE_ID}" == "null" ] || [ -z "${ZONE_ID}" ]; then
  echo "错误: 无法找到 Zone ID。请检查您的域名和 API Token 是否正确。"
  exit 1
fi
echo "Zone ID: ${ZONE_ID}"

echo "正在获取 Record ID for ${RECORD_NAME}..."
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${RECORD_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ "${RECORD_ID}" == "null" ] || [ -z "${RECORD_ID}" ]; then
  echo "错误: 无法找到 Record ID。请检查该 DNS 记录是否存在。"
  exit 1
fi
echo "Record ID: ${RECORD_ID}"

echo "正在删除记录 ${RECORD_NAME}..."
DELETE_RESULT=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json")

SUCCESS=$(echo ${DELETE_RESULT} | jq -r '.success')

if [ "${SUCCESS}" == "true" ]; then
  echo "成功删除 DNS 记录！"
else
  echo "删除失败。Cloudflare 返回信息:"
  echo ${DELETE_RESULT} | jq
fi
