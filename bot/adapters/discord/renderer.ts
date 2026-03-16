import type { OutboundResponse } from '@/core/types/response.js'

// Scaffold only — returns formatted Discord message content
export function formatDiscordResponse(response: OutboundResponse): string {
  switch (response.type) {
    case 'event_list': {
      const lines = [response.text]
      response.events?.slice(0, 5).forEach((e, i) => {
        lines.push(`\n**${i + 1}. ${e.name}**`)
        lines.push(`📅 ${e.date} | 📍 ${e.venue}, ${e.city}`)
        if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
      })
      return lines.join('\n')
    }

    case 'deep_link':
      return `${response.text}\n${response.link}`

    default:
      return response.text
  }
}
