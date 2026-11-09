FROM python:3.11.17-slim@sha256:b7a9e5f6a93d6d4a31f129bbd4bdee69efccb6ded0fb230d78aafaf37af98377

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONPATH=/home/user/app:/home/user/app/src

WORKDIR $HOME/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user dashboard ./dashboard
COPY --chown=user src ./src

EXPOSE 7860

CMD ["uvicorn", "dashboard.api:app", "--host", "0.0.0.0", "--port", "7860"]
