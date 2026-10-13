import { activeScreen } from './nav'

describe('activeScreen', () => {
  it('matches the longest screen path', () => {
    expect(activeScreen('/')?.label).toBe('Today')
    expect(activeScreen('/meals/recipes')?.label).toBe('Meals')
    expect(activeScreen('/settings')?.label).toBe('Settings')
  })

  it('files a person profile under Family', () => {
    expect(activeScreen('/person/abc')?.label).toBe('Family')
  })
})
