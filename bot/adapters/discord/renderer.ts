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

    case 'event_card': {
      const e = response.events?.[0]
      if (!e) return response.text
      const lines: string[] = []
      lines.push(`**${e.name}**`)
      lines.push(`📅 ${e.date} | 📍 ${e.venue}, ${e.city}`)
      if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
      if (e.aiSummary) lines.push(`\n_${e.aiSummary}_`)
      // Include action links
      for (const a of response.actions ?? []) {
        if (a.id === 'book_event' && e.url) lines.push(`\n🎟 [Get Tickets](${e.url})`)
        if (a.id === 'directions') lines.push(`📍 [Directions](${a.payload})`)
      }
      return lines.join('\n')
    }

    case 'deep_link':
      return `${response.text}\n${response.link}`

    default:
      return response.text
  }
}
