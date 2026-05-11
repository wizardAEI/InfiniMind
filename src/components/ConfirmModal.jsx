import Modal from "./Modal.jsx";

function ConfirmModal({ request, onCancel, onConfirm }) {
  return (
    <Modal
      className="confirm-modal"
      eyebrow="Confirm"
      title={request.title}
      onClose={onCancel}
      footer={
        <>
          <button className="secondary-modal-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-modal-button" type="button" onClick={onConfirm}>
            {request.confirmLabel || "Confirm"}
          </button>
        </>
      }
    >
      <p>{request.body}</p>
    </Modal>
  );
}

export default ConfirmModal;
