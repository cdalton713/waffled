import { Avatar } from '@waffled/web'

export const FamilyFaces = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar person="kevin" />
    <Avatar person="kelly" />
    <Avatar person="wally" />
    <Avatar person="lottie" />
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Avatar person="kelly" size="sm" />
    <Avatar person="kelly" size="md" />
    <Avatar person="kelly" size="lg" />
  </div>
)
