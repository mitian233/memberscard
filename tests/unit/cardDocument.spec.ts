import { describe, expect, it } from 'vitest'
import {
  createCardDocument,
  resetAvatar,
  resetCardDocument,
  resetCardField,
  updateCardField
} from '@/editor/cardDocument'
import type { CardTemplateDefinition } from '@/types/card'

const template: CardTemplateDefinition = {
  id: 'current',
  canvas: { width: 960, height: 640, radius: 40 },
  assets: { background: '/background.svg', logo: '/logo.svg', avatarFrame: '/frame.jpg' },
  defaults: {
    name: '二葉 つくし', nameEn: 'Tsukushi Futaba', bandName: 'Morfonica', birthday: '9/15',
    avatar: { src: '/demo.png', left: -133.56, top: 45, scale: 0.58 }
  },
  avatarFrame: { left: 30, top: 45, width: 360, height: 550, radius: 25 },
  fields: {},
  staticObjects: []
}

describe('CardDocument', () => {
  it('creates an independent document from template defaults', () => {
    const first = createCardDocument(template)
    const second = createCardDocument(template)
    first.avatar.left = 0
    expect(second.avatar.left).toBe(-133.56)
  })

  it('updates and resets one field without changing the avatar', () => {
    const edited = updateCardField(createCardDocument(template), 'name', '新名字')
    edited.avatar.left = -100
    const reset = resetCardField(edited, template, 'name')
    expect(reset.name).toBe('二葉 つくし')
    expect(reset.avatar.left).toBe(-100)
  })

  it('resets only avatar state and can reset the full document', () => {
    const edited = updateCardField(createCardDocument(template), 'bandName', 'Other')
    edited.avatar.left = 2
    expect(resetAvatar(edited, template).bandName).toBe('Other')
    expect(resetCardDocument(template)).toEqual(createCardDocument(template))
  })
})
