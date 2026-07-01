from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Catch, Comment, User
from app.schemas import CommentCreate, CommentOut, CommentUpdate

router = APIRouter(tags=["comments"])


def _to_comment_out(comment: Comment) -> CommentOut:
    return CommentOut(
        id=comment.id,
        catch_id=comment.catch_id,
        user_id=comment.user_id,
        display_name=comment.user.display_name,
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/catches/{catch_id}/comments", response_model=list[CommentOut])
def list_comments(
    catch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Catch, catch_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catch not found")

    comments = (
        db.query(Comment)
        .options(joinedload(Comment.user))
        .filter(Comment.catch_id == catch_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    return [_to_comment_out(c) for c in comments]


@router.post("/catches/{catch_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    catch_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Catch, catch_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catch not found")

    comment = Comment(catch_id=catch_id, user_id=current_user.id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _to_comment_out(comment)


def _get_owned_comment(comment_id: int, db: Session, current_user: User) -> Comment:
    comment = db.query(Comment).options(joinedload(Comment.user)).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own comments")
    return comment


@router.put("/comments/{comment_id}", response_model=CommentOut)
def update_comment(
    comment_id: int,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = _get_owned_comment(comment_id, db, current_user)
    comment.body = payload.body
    comment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)
    return _to_comment_out(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = _get_owned_comment(comment_id, db, current_user)
    db.delete(comment)
    db.commit()
