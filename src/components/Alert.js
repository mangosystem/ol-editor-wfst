import React from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';

export default function Alert(props) {
  const { alertOpen, setAlertOpen, clearDataAndLayer } = props;

  const handleClose = () => {
    setAlertOpen(false);
  };

  const handleClearAndClose = () => {
    clearDataAndLayer();
    handleClose();
  }

  return (
    <Dialog
      open={alertOpen}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <DialogTitle id="alert-dialog-title">{"변경사항 적용"}</DialogTitle>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          저장하지 않은 수정사항이 있습니다. <br />이전 수정 사항을 모두 초기화하시겠습니까?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          아니요.
        </Button>
        <Button onClick={handleClearAndClose} color="primary" autoFocus>
          네.
        </Button>
      </DialogActions>
    </Dialog>
  );
}
