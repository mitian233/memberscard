import { describe, expect, it } from 'vitest'
import background from '@/assets/oldVerBg.svg'
import logo from '@/assets/ring_logo.svg'
import { legacyCardTemplate } from '@/templates/legacyCardTemplate'

describe('legacyCardTemplate', () => {
  it('defines the complete legacy-card geometry and render order', () => {
    const expectedFields = [
      {
        role: 'field',
        field: 'bandName',
        left: 430,
        top: 300,
        fontSize: 35,
        fontFamily: 'Poppins',
        fontWeight: 'bold',
        fill: '#000',
      },
      {
        role: 'field',
        field: 'name',
        left: 430,
        top: 340,
        fontSize: 60,
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        fill: '#000',
      },
      {
        role: 'field',
        field: 'nameEn',
        left: 430,
        top: 420,
        fontSize: 30,
        fontFamily: 'Poppins',
        fontWeight: 'normal',
        fill: '#000',
      },
    ]

    const expectedStaticObjects = [
      {
        role: 'static',
        id: 'card',
        type: 'rect',
        left: 0,
        top: 0,
        width: 960,
        height: 640,
        radius: 40,
        fill: '#fff',
      },
      {
        role: 'static',
        id: 'background',
        type: 'image',
        asset: 'background',
        left: 0,
        top: 0,
        width: 960,
        height: 640,
        radius: 40,
      },
      {
        role: 'static',
        id: 'avatar-background',
        type: 'rect',
        left: 87,
        top: 221,
        width: 305,
        height: 368,
        radius: 0,
        fill: '#d8e8f2',
      },
      {
        role: 'static',
        id: 'logo',
        type: 'image',
        asset: 'logo',
        left: 730,
        top: 220,
        width: 150,
        height: 62,
      },
      {
        role: 'static',
        id: 'disclaimer-marker-1',
        type: 'circle',
        left: 430,
        top: 510,
        radius: 7.5,
        fill: '#000',
      },
      {
        role: 'static',
        id: 'disclaimer-marker-2',
        type: 'circle',
        left: 430,
        top: 560,
        radius: 7.5,
        fill: '#000',
      },
      {
        role: 'static',
        id: 'disclaimer-text-1',
        type: 'text',
        text: 'この会員証はライブハウスRiNGの\n会員であることを証明するものです。',
        left: 446,
        top: 500,
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        fontSize: 20,
        fill: '#000',
      },
      {
        role: 'static',
        id: 'disclaimer-text-2',
        type: 'text',
        text: 'この会員証は会員本人以外は使用できません。',
        left: 446,
        top: 550,
        fontFamily: 'Noto Sans JP',
        fontWeight: 'bold',
        fontSize: 20,
        fill: '#000',
      },
    ]

    expect(legacyCardTemplate).toEqual({
      id: 'legacy',
      canvas: { width: 960, height: 640, radius: 40 },
      assets: { background, logo },
      defaults: {
        name: '二葉 つくし',
        nameEn: 'Tsukushi Futaba',
        bandName: 'Morfonica',
        avatar: { src: '/demo.png', left: -76.56, top: 221, scale: 0.58 },
      },
      avatarFrame: { left: 87, top: 221, width: 305, height: 368, radius: 0 },
      fields: {
        bandName: expectedFields[0],
        name: expectedFields[1],
        nameEn: expectedFields[2],
      },
      staticObjects: expectedStaticObjects,
    })

    expect(legacyCardTemplate.defaults).not.toHaveProperty('birthday')
    expect(Object.keys(legacyCardTemplate.fields)).toEqual(['bandName', 'name', 'nameEn'])
    expect(Object.values(legacyCardTemplate.fields)).toEqual(expectedFields)
    expect(legacyCardTemplate.staticObjects.map(({ id }) => id)).toEqual([
      'card',
      'background',
      'avatar-background',
      'logo',
      'disclaimer-marker-1',
      'disclaimer-marker-2',
      'disclaimer-text-1',
      'disclaimer-text-2',
    ])
  })
})
