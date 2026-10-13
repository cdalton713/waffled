import { RecipeView } from './RecipeView'
import { Button } from '@/components/ui/button'
import { DataIcon } from '@/components/ui/data-icon'
import { Modal } from '@/components/ui/modal'

// Modal preview of a recipe — just the chrome around the shared RecipeView, so a
// previewed recipe looks exactly like the full-screen route.
export function RecipeModal({
  recipeId,
  onClose,
  onSelect,
  selectLabel,
}: {
  recipeId: string
  onClose: () => void
  onSelect?: () => void
  selectLabel?: string
}) {
  return (
    <Modal className="modal-overlay" onClose={onClose}>
      <div className="modal-card recipe-modal-card" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="unstyled"
          className="modal-close"
          aria-label="Close recipe"
          onClick={onClose}
        >
          <DataIcon value={'×'} kind="meal" />
        </Button>
        <RecipeView id={recipeId} onSelect={onSelect} selectLabel={selectLabel} />
      </div>
    </Modal>
  )
}
