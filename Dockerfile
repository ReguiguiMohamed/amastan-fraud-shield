FROM python:3.11.16-slim@sha256:e41613d42d4891e4930f79523f93f81bbc7632584ec65e36ab055f41a800b41e

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
